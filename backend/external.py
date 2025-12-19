"""External web search and scraping using Perplexity and Firecrawl APIs."""

import logging
import os
import time
import uuid
import re
import tempfile
from typing import List, Dict, Tuple
from urllib.parse import urlparse
from datetime import datetime, timezone

from perplexity import Perplexity
from firecrawl import Firecrawl

from pipeline import get_parse
from clients import get_storage_client, get_cosmos_client
from core.config import (
    PERPLEXITY_API_KEY,
    FIRECRAWL_API_KEY,
    PERPLEXITY_MAX_TOKENS_PER_PAGE,
    FIRECRAWL_WAIT_TIMEOUT
)

logger = logging.getLogger(__name__)


class External:
    """Web search and scraping using Perplexity and Firecrawl APIs."""

    def __init__(self):
        self.perplexity = Perplexity(api_key=PERPLEXITY_API_KEY)
        self.firecrawl = Firecrawl(api_key=FIRECRAWL_API_KEY)
        self.parse = get_parse()
        self.storage = get_storage_client()
        self.cosmos_client = get_cosmos_client()

    def search(self, query: str, max_results: int = 10) -> List[Dict]:
        """Search using Perplexity."""
        try:
            result = self.perplexity.search.create(
                query=query,
                max_results=max_results,
                max_tokens_per_page=PERPLEXITY_MAX_TOKENS_PER_PAGE
            )
            return [{
                "title": r.title,
                "url": r.url,
                "snippet": r.snippet,
                "date": getattr(r, "date", None),
                "domain": urlparse(r.url).netloc,
            } for r in result.results]
        except Exception as e:
            logger.error(f"Search failed: {e}")
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
                wait_timeout=FIRECRAWL_WAIT_TIMEOUT
            )
            logger.info(f"[TIMING] batch_scrape_api: {time.time() - t0:.3f}s")

            results = [{
                "url": doc.metadata.source_url,
                "status": "success",
                "markdown": doc.markdown,
                "title": doc.metadata.title or "",
                "description": doc.metadata.description or "",
                "language": doc.metadata.language or "",
            } for doc in result.data]

            logger.info(f"[BATCH_SCRAPE] Completed: {len(results)} results in {time.time() - t0:.3f}s")
            return results

        except Exception as e:
            logger.error(f"[BATCH_SCRAPE] Failed: {e}")
            return [{"url": url, "status": "error", "error": str(e)} for url in urls]

    async def process_scraped_content(self, content: Dict, project_id: str, user_id: str) -> Dict:
        """Process scraped content: chunk, embed, store."""
        url = content.get("url")

        if content.get("status") != "success":
            return {"url": url, "status": content.get("status"), "error": content.get("error")}

        try:
            file_id = self._make_file_id(project_id, str(url or ""))
            file_name = self._make_file_name(str(url or ""), str(content.get("title") or ""))
            chunks, file_map, page_map = await self._build_chunks(content["markdown"], file_name)

            metadata = {
                "source_type": "website",
                "source_url": url,
                "domain": urlparse(url).netloc,
                "title": content.get("title", ""),
                "blurb": content.get("description", ""),
                "doc_type": "website",
                "language": content.get("language", ""),
                "crawled_at": datetime.now(timezone.utc).isoformat(),
                "project_id": project_id,
            }

            await self.cosmos_client.batch_upsert_documents(chunks, file_id, file_name, user_id, metadata)

            try:
                await self.storage.create_web_file_record(file_id, user_id, file_name, url, content["markdown"], metadata, file_map, page_map)
                await self.storage.link_file_to_project(project_id, file_id, user_id)
            except Exception as db_error:
                # Clean up vectors if DB operations fail
                logger.error(f"DB operation failed after vector upsert, cleaning up: {db_error}")
                try:
                    await self.cosmos_client.delete_document(file_id, user_id)
                except Exception:
                    pass  # Best effort cleanup
                raise

            return {"url": url, "status": "success", "file_id": file_id}

        except Exception as e:
            logger.error(f"Failed to process {url}: {e}")
            return {"url": url, "status": "error", "error": str(e)}

    async def _build_chunks(self, markdown: str, file_name: str) -> Tuple[List, Dict, Dict]:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False, encoding='utf-8') as f:
            f.write(markdown)
            tmp_path = f.name
        try:
            page_data, _ = await self.parse.parse_document(tmp_path, file_name)
            doc_structure = self.parse.build_chunks(page_data, tmp_path)
            return doc_structure["chunks"], doc_structure["file_map"], doc_structure["page_map"]
        finally:
            os.unlink(tmp_path)

    def _make_file_id(self, project_id: str, url: str) -> str:
        try:
            ns = uuid.UUID(project_id)
        except ValueError:
            ns = uuid.uuid5(uuid.NAMESPACE_DNS, project_id)
        return str(uuid.uuid5(ns, url))

    def _make_file_name(self, url: str, title: str) -> str:
        domain = urlparse(url).netloc
        name = f"{domain}_{title or 'page'}"[:100]
        return re.sub(r'[^\w\-_.]', '_', name) + ".md"
