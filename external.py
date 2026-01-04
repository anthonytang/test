"""External web search and scraping using Perplexity and Firecrawl APIs."""

import logging
import os
import time
import uuid
import tempfile
from typing import List, Dict
from urllib.parse import urlparse
from datetime import datetime, timezone

from perplexity import Perplexity
from firecrawl import Firecrawl

from pipeline import get_parser
from core import File, Meta
from clients import get_storage_client, get_cosmos_client
from core.exceptions import ExternalServiceError, DatabaseError, StudioError
from core.config import (
    PERPLEXITY_API_KEY,
    FIRECRAWL_API_KEY,
    PERPLEXITY_MAX_TOKENS_PER_PAGE,
    FIRECRAWL_WAIT_TIMEOUT,
)

logger = logging.getLogger(__name__)


class External:
    """Web search and scraping using Perplexity and Firecrawl APIs."""

    def __init__(self):
        self.perplexity = Perplexity(api_key=PERPLEXITY_API_KEY)
        self.firecrawl = Firecrawl(api_key=FIRECRAWL_API_KEY)
        self.parser = get_parser()
        self.storage = get_storage_client()
        self.cosmos_client = get_cosmos_client()

    def search(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search using Perplexity."""
        try:
            result = self.perplexity.search.create(
                query=query,
                max_results=max_results,
                max_tokens_per_page=PERPLEXITY_MAX_TOKENS_PER_PAGE,
            )
            return [
                {
                    "title": r.title,
                    "url": r.url,
                    "snippet": r.snippet,
                    "date": getattr(r, "date", None),
                    "domain": urlparse(r.url).netloc,
                }
                for r in result.results
            ]
        except Exception as e:
            logger.error(f"Search failed: {e}", exc_info=True)
            return []

    def batch_scrape(self, urls: List[str]) -> List[Dict]:
        """Batch scrape URLs using Firecrawl."""
        if not urls:
            return []

        t0 = time.time()
        logger.info(f"[BATCH_SCRAPE] Starting for {len(urls)} URLs")

        try:
            result = self.firecrawl.batch_scrape(
                urls,
                formats=["markdown"],
                poll_interval=2,
                wait_timeout=FIRECRAWL_WAIT_TIMEOUT,
            )
            logger.info(f"[TIMING] batch_scrape_api: {time.time() - t0:.3f}s")

            results = [
                {
                    "url": doc.metadata.source_url,
                    "status": "success",
                    "markdown": doc.markdown,
                    "title": doc.metadata.title,
                    "description": doc.metadata.description,
                    "language": doc.metadata.language,
                }
                for doc in result.data
            ]

            logger.info(
                f"[BATCH_SCRAPE] Completed: {len(results)} results in {time.time() - t0:.3f}s"
            )
            return results

        except Exception as e:
            logger.error(f"[BATCH_SCRAPE] Failed: {e}", exc_info=True)
            raise ExternalServiceError(f"Firecrawl scrape failed: {e}")

    async def process_scraped_content(
        self, content: Dict, project_id: str, user_id: str
    ) -> Dict:
        """Process scraped content: chunk, embed, store."""
        url = content["url"]

        if content["status"] != "success":
            return {
                "url": url,
                "status": content["status"],
                "error": content.get("error"),
            }

        try:
            file_id = self._make_file_id(project_id, url)
            file = File(id=file_id, name=url)
            result = await self._build_chunks(content["markdown"], file)

            meta = Meta(
                blurb=content["description"],
                doc_type="website",
            )

            await self.cosmos_client.batch_upsert_documents(
                result.chunks, user_id, meta
            )

            db_metadata = {
                "source_type": "website",
                "domain": urlparse(url).netloc,
                "title": content["title"],
                "blurb": content["description"],
                "doc_type": "website",
                "language": content["language"],
                "crawled_at": datetime.now(timezone.utc).isoformat(),
                "project_id": project_id,
                "display_type": "text",
            }

            try:
                await self.storage.create_web_file_record(
                    file_id,
                    user_id,
                    url,
                    content["markdown"],
                    db_metadata,
                    result.content,
                )
                await self.storage.link_file_to_project(project_id, file_id, user_id)
            except Exception as db_error:
                logger.error(
                    f"DB operation failed after vector upsert, cleaning up: {db_error}",
                    exc_info=True,
                )
                try:
                    await self.cosmos_client.delete_file(file_id, user_id)
                except Exception:
                    pass
                raise DatabaseError(
                    f"Failed to record web file in database: {db_error}"
                )

            return {"url": url, "status": "success", "file_id": file_id}

        except StudioError:
            raise
        except Exception as e:
            logger.error(f"Failed to process {url}: {e}", exc_info=True)
            raise ExternalServiceError(f"Failed to process scraped content: {e}")

    async def _build_chunks(self, markdown: str, file: File):
        """Build chunks from markdown content."""
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".md", delete=False, encoding="utf-8"
        ) as f:
            f.write(markdown)
            tmp_path = f.name
        try:
            data = await self.parser.parse_document(tmp_path)
            return self.parser.build_chunks(data, file)
        finally:
            os.unlink(tmp_path)

    def _make_file_id(self, project_id: str, url: str) -> str:
        try:
            ns = uuid.UUID(project_id)
        except Exception:
            ns = uuid.uuid5(uuid.NAMESPACE_DNS, project_id)
        return str(uuid.uuid5(ns, url))
