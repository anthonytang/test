"""Web search and crawl endpoints."""

import asyncio
import logging
import time

from fastapi import APIRouter, Request

from auth import get_user_from_request
from external import External
from state import crawl_semaphore
from core.exceptions import ValidationError, InternalServerError, StudioError
from schemas import WebSearchRequest, WebCrawlRequest

logger = logging.getLogger(__name__)
router = APIRouter()

# Service clients
external = External()


@router.post("/search")
async def search_urls(request_body: WebSearchRequest, request: Request):
    """Search for URLs using Perplexity."""
    try:
        user = get_user_from_request(request)
        user_id = user["user_id"]
        user_email = user["user_email"]

        logger.info(
            "AUDIT: User %s (%s) searched URLs. Query='%s'",
            user_email,
            user_id,
            request_body.query,
        )

        results = await asyncio.to_thread(
            external.search,
            query=request_body.query,
            max_results=request_body.max_results,
        )

        logger.info("Search returned %d URLs for user %s", len(results), user_id)

        return {
            "success": True,
            "query": request_body.query,
            "results": results,
            "results_count": len(results),
        }

    except StudioError:
        raise
    except Exception as e:
        raise InternalServerError(f"Failed to search URLs: {str(e)}")


@router.post("/crawl")
async def crawl_urls(request_body: WebCrawlRequest, request: Request):
    """
    Scrape URLs using Firecrawl batch API and store in project.

    Uses batch scraping for parallel URL fetching, then processes
    results with a semaphore to limit concurrent DB/embedding operations.
    """
    total_start = time.time()
    user = get_user_from_request(request)
    user_id = user["user_id"]
    user_email = user["user_email"]

    logger.info(
        "AUDIT: User %s (%s) started URL crawl. ProjectId=%s, UrlCount=%d",
        user_email,
        user_id,
        request_body.project_id,
        len(request_body.urls),
    )

    if not request_body.urls:
        raise ValidationError("No URLs provided")

    # Step 1: Batch scrape all URLs
    t0 = time.time()
    scraped_results = await asyncio.to_thread(external.batch_scrape, request_body.urls)
    logger.info(
        f"[TIMING] batch_scrape_total: {time.time() - t0:.3f}s for {len(request_body.urls)} URLs"
    )

    # Step 2: Process results with concurrency limit
    async def process_with_semaphore(content: dict) -> dict:
        async with crawl_semaphore:
            return await external.process_scraped_content(
                content=content, project_id=request_body.project_id, user_id=user_id
            )

    t0 = time.time()
    results = await asyncio.gather(
        *[process_with_semaphore(content) for content in scraped_results]
    )
    logger.info(f"[TIMING] process_all: {time.time() - t0:.3f}s")

    # Count results
    urls_completed = sum(1 for r in results if r.get("status") == "success")
    urls_failed = len(results) - urls_completed

    logger.info(
        f"[TIMING] crawl_total: {time.time() - total_start:.3f}s for {len(request_body.urls)} "
        f"URLs ({urls_completed} success, {urls_failed} failed)"
    )

    return {
        "success": True,
        "urls_total": len(request_body.urls),
        "urls_completed": urls_completed,
        "urls_failed": urls_failed,
        "results": results,
    }
