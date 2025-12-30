"""Shared state and concurrency controls for Studio API."""

import asyncio
from typing import Any
from core.config import (
    FILE_PROCESSING_CONCURRENCY,
    SECTION_PROCESSING_CONCURRENCY,
    URL_CRAWL_CONCURRENCY,
)
from core.state_manager import StateManager

# Persistent state manager
state_manager = StateManager()

# Concurrency semaphores
file_semaphore = asyncio.Semaphore(FILE_PROCESSING_CONCURRENCY)
section_semaphore = asyncio.Semaphore(SECTION_PROCESSING_CONCURRENCY)
crawl_semaphore = asyncio.Semaphore(URL_CRAWL_CONCURRENCY)

# Tracking for local asyncio tasks (non-serializable, must stay instance-local)
section_tasks: dict[str, asyncio.Task] = {}