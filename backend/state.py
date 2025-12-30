"""Shared state and concurrency controls for Studio API."""

import asyncio
from typing import Any

from core.config import (
    FILE_PROCESSING_CONCURRENCY,
    SECTION_PROCESSING_CONCURRENCY,
    URL_CRAWL_CONCURRENCY,
)

# Concurrency semaphores
file_semaphore = asyncio.Semaphore(FILE_PROCESSING_CONCURRENCY)
section_semaphore = asyncio.Semaphore(SECTION_PROCESSING_CONCURRENCY)
crawl_semaphore = asyncio.Semaphore(URL_CRAWL_CONCURRENCY)

# Job state tracking
# section_jobs: {section_id: {processing_id, user_id, cancelled, task, ...}}
section_jobs: dict[str, Any] = {}

# extraction_jobs: {generation_id: {cancelled: bool}}
extraction_jobs: dict[str, dict] = {}
