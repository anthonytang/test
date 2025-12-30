"""Main pipeline orchestrating retrieval, AI processing, and response generation."""

import asyncio
import logging
import time
from typing import List, Dict, Optional, Any

from ai import get_agent, OutputFormat
from clients import get_cosmos_client, get_storage_client
from core.config import RETRIEVAL_TIMEOUT_SECONDS
from core.exceptions import AgentResponseError, StudioError, InternalServerError
from .search import Search
from .context import Context
from .citations import Citations
from core import (
    Match,
    Sheet,
    Outcome,
    Response,
    Text,
    Table,
    Chart,
    Item,
    Row,
    Citation,
    Analysis,
)


class Pipeline:
    """Processing pipeline for document section extraction."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.agent = get_agent()
        self.cosmos_client = get_cosmos_client()
        self.azure_storage = get_storage_client()
        self.search = Search()
        self.context = Context()
        self.citations = Citations()

    async def _fetch_sheets(self, matches: List[Match]) -> Dict[str, Dict[str, Sheet]]:
        """Fetch full sheet data for truncated table matches."""
        file_ids = set()
        for match in matches:
            if match.slice and match.slice.truncated:
                file_ids.add(match.file.id)

        if not file_ids:
            return {}

        sheets_map: Dict[str, Dict[str, Sheet]] = {}
        for file_id in file_ids:
            try:
                info = await self.azure_storage.get_file_info(file_id)
                if info and info["metadata"] and info["metadata"]["sheets"]:
                    sheets_map[file_id] = {
                        name: Sheet(**data)
                        for name, data in info["metadata"]["sheets"].items()
                    }
            except Exception as e:
                self.logger.error(f"[SHEETS] Failed to load {file_id}: {e}")

        return sheets_map

    async def _generate_ai_response(
        self,
        context: str,
        section_name: str,
        section_description: str,
        template_description: str,
        project_description: str,
        output_format: OutputFormat,
        dependent_section_results: Optional[List[Dict[str, str]]] = None,
    ) -> Response:
        """Generate AI response using context."""
        dependent_sections_context = (
            self.context.format_dependent_sections(dependent_section_results)
            if dependent_section_results
            else None
        )

        raw_response = await asyncio.wait_for(
            self.agent.generate_response(
                context,
                section_name,
                section_description,
                template_description,
                project_description,
                output_format,
                dependent_sections_context,
            ),
            timeout=RETRIEVAL_TIMEOUT_SECONDS,
        )

        if not raw_response:
            self.logger.error("Empty response from AI agent")
            raise AgentResponseError("Empty response from AI agent")

        return self.citations.parse_response(raw_response, output_format)

    async def run_with_progress(
        self,
        section_id: str,
        file_ids: List[str],
        section_name: str,
        section_description: str,
        template_description: str,
        project_description: str,
        output_format: OutputFormat,
        dependent_section_results: Optional[List[Dict[str, str]]] = None,
        progress_callback=None,
    ) -> Outcome:
        """Run pipeline with progress reporting. Propagates CancelledError for cancellation."""
        start_time = time.time()

        async def report_progress(
            stage: str, progress: int, message: str, details: Dict[Any, Any] = {}
        ):
            if progress_callback:
                await progress_callback(
                    {
                        "section_id": section_id,
                        "stage": stage,
                        "progress": progress,
                        "message": message,
                        "details": details,
                    }
                )

        try:
            await report_progress("planning", 10, "Planning")
            queries = await self.search._generate_search_queries(
                section_name,
                section_description,
                template_description,
                project_description,
            )

            await report_progress("searching", 25, "Searching")
            all_matches = await self.search._execute_search_queries(queries, file_ids)

            await report_progress("retrieving", 40, "Gathering")
            matches = self.search._deduplicate(all_matches)
            self.logger.info(f"Deduplicated to {len(matches)} matches")
            sheets_map = await self._fetch_sheets(matches)
            context, sources = self.context.build(matches, sheets_map)

            await report_progress("generating", 50, "Generating")
            response = await self._generate_ai_response(
                context,
                section_name,
                section_description,
                template_description,
                project_description,
                output_format,
                dependent_section_results,
            )

            await report_progress("finalizing", 75, "Finalizing")
            formatted_response = self.context.format_response(response)

            # Score citations and analyze in parallel
            citations, analysis = await asyncio.gather(
                self.citations.score_response(response, sources),
                self.agent.analyze(
                    section_name=section_name,
                    section_description=section_description,
                    context=context,
                    template_description=template_description,
                    project_description=project_description,
                    formatted_response=formatted_response,
                ),
            )

            await report_progress("complete", 100, "Done")

            self.logger.info(
                f"[PIPELINE] Completed {section_name} in {time.time() - start_time:.2f}s"
            )

            return Outcome(response=response, citations=citations, analysis=analysis)

        except asyncio.CancelledError:
            self.logger.info(f"[PIPELINE] Section {section_id} cancelled")
            raise
        except StudioError as e:
            await report_progress("error", -1, f"Pipeline failed: {e.message}")
            raise
        except Exception as e:
            self.logger.error(f"Unexpected pipeline error: {e}", exc_info=True)
            await report_progress(
                "error", -1, "Pipeline failed due to an unexpected system error"
            )
            raise InternalServerError(f"Unexpected pipeline failure: {e}")
