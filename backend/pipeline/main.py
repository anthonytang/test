"""Main pipeline orchestrating retrieval, AI processing, and response generation."""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import List, Dict, Optional, Any

from ai import get_agent, OutputFormat
from clients import get_cosmos_client, get_storage_client
from .search import Search
from .context import Context
from .citations import Citations
from core.config import RETRIEVAL_TIMEOUT_SECONDS


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

    async def _fetch_full_table_content(self, chunks: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """Fetch full table content from database for truncated chunks."""
        file_ids = set()
        for chunk in chunks:
            meta = chunk.get('metadata', {})
            if meta.get('is_truncated') and meta.get('file_id'):
                file_ids.add(meta['file_id'])

        if not file_ids:
            return {}

        full_excel_map = {}
        for file_id in file_ids:
            try:
                file_info = await self.azure_storage.get_file_info(file_id)
                sheets = file_info.get('metadata', {}).get('full_excel_sheets') if file_info else None
                if sheets:
                    full_excel_map[file_id] = sheets
            except Exception as e:
                self.logger.error(f"[EXCEL] Failed to load {file_id}: {e}")

        return full_excel_map

    async def _generate_ai_response(self, context: str, section_name: str, section_description: str,
                                    template_description: str, project_description: str,
                                    output_format: OutputFormat,
                                    dependent_section_results: Optional[List[Dict[str, str]]] = None) -> List[Dict[str, Any]]:
        """Generate AI response using context."""
        dependent_sections_context = self.context.format_dependent_sections(dependent_section_results) if dependent_section_results else None

        raw_response = await asyncio.wait_for(
            self.agent.generate_response(
                context, section_name, section_description,
                template_description, project_description, output_format,
                dependent_sections_context
            ),
            timeout=RETRIEVAL_TIMEOUT_SECONDS
        )

        if not raw_response:
            raise RuntimeError("Empty response from AI agent")

        response = self.citations.parse_response(raw_response, output_format)
        if not response:
            raise RuntimeError("Failed to parse AI response")

        self.logger.info(f"AI response: {len(response)} items")
        return response

    async def run_with_progress(self, section_id: str, file_ids: List[str],
                                section_name: str, section_description: str,
                                template_description: str, project_description: str,
                                output_format: OutputFormat,
                                execution_mode: str = "both",
                                dependent_section_results: Optional[List[Dict[str, str]]] = None,
                                progress_callback=None) -> Dict[str, Any]:
        """Run pipeline with progress reporting. Propagates CancelledError for cancellation."""
        start_time = time.time()

        async def report_progress(stage: str, progress: int, message: str, details: Optional[Dict[Any, Any]] = None):
            if progress_callback:
                await progress_callback({
                    "section_id": section_id, "stage": stage, "progress": progress,
                    "message": message, "details": details or {}
                })

        response = None
        final_line_map = {}
        evidence_analysis = None

        try:
            await report_progress("planning", 5, "Planning")
            queries = await self.search._generate_search_queries(
                section_name, section_description, template_description, project_description
            )
            num_queries = len(queries)

            await report_progress("searching", 15, "Searching")
            all_chunks = await self.search._execute_search_queries(queries, file_ids)

            await report_progress("retrieving", 35, "Gathering")
            unique_chunks = self.search._deduplicate_chunks(all_chunks)
            self.logger.info(f"Deduplicated to {len(unique_chunks)} unique chunks")
            full_excel_map = await self._fetch_full_table_content(unique_chunks)
            context, line_map = self.context.build(unique_chunks, full_excel_map)

            if execution_mode in ["both", "response_only"]:
                await report_progress("generating", 45, "Generating")
                response_task = self._generate_ai_response(
                    context, section_name, section_description,
                    template_description, project_description, output_format,
                    dependent_section_results
                )
                evidence_task = self.agent.analyze_evidence_quality(
                    section_name=section_name, section_description=section_description,
                    context=context, template_description=template_description,
                    project_description=project_description
                )
                response, evidence_analysis = await asyncio.gather(response_task, evidence_task)

                await report_progress("scoring", 80, "Citing")
                final_line_map = await self.citations.score_response(response, line_map, output_format)

            await report_progress("complete", 100, "Done")

            return {
                "response": response,
                "line_map": final_line_map,
                "evidence_analysis": evidence_analysis,
                "metadata": {
                    "section_id": section_id,
                    "section_name": section_name,
                    "processing_duration": time.time() - start_time,
                    "execution_mode": execution_mode,
                    "output_format": output_format.value if isinstance(output_format, OutputFormat) else output_format,
                    "chunks_processed": len(unique_chunks),
                    "queries_executed": num_queries,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
            }

        except asyncio.CancelledError:
            self.logger.info(f"[PIPELINE] Section {section_id} cancelled")
            raise
        except Exception as e:
            await report_progress("error", -1, f"Pipeline failed: {str(e)}")
            raise
