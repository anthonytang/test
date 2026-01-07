"""File processing endpoints."""

import asyncio
import json
import logging
import os
import tempfile
import time
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sse_starlette import EventSourceResponse

from auth import extract_user_from_token, get_user_from_request
from clients import get_cosmos_client, get_storage_client, get_gotenberg_client
from pipeline import get_parser
from core import File as CitationFile, DisplayType
from core.config import CONVERTIBLE_EXTENSIONS, TABLE_EXTENSIONS
from state import file_semaphore, file_jobs
from core.exceptions import (
    ValidationError,
    AuthenticationError,
    InternalServerError,
    ConversionError,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Service clients
cosmos_client = get_cosmos_client()
storage_client = get_storage_client()
parser = get_parser()


class FileAbortRequest(BaseModel):
    processing_id: str


def progress_event(file_id: str, stage: str, progress: int, message: str) -> dict:
    """Create a progress SSE event."""
    return {
        "event": "progress",
        "data": json.dumps({
            "file_id": file_id,
            "stage": stage,
            "progress": progress,
            "message": message,
            "timestamp": time.time(),
        }),
    }


def error_event(file_id: str, error: str) -> dict:
    """Create an error SSE event."""
    return {
        "event": "error",
        "data": json.dumps({
            "file_id": file_id,
            "stage": "error",
            "progress": 0,
            "error": error,
            "timestamp": time.time(),
        }),
    }


def cancelled_event(file_id: str) -> dict:
    """Create a cancelled SSE event."""
    return {
        "event": "cancelled",
        "data": json.dumps({
            "file_id": file_id,
            "stage": "cancelled",
            "progress": 0,
            "message": "Cancelled",
            "timestamp": time.time(),
        }),
    }


async def stream_file_processing(user_id: str, file_id: str, job_state: dict, request: Request):
    """Process file: Download → Convert → Parse → Analyze → Index → Save"""
    temp_path = None
    converted_path = None
    processing_id = job_state["processing_id"]

    def is_cancelled():
        return job_state.get("cancelled", False)

    try:
        # Check if already cancelled before starting
        if is_cancelled():
            logger.info(f"[SSE] File {file_id} already cancelled before starting")
            yield cancelled_event(file_id)
            return

        await storage_client.update_processing_status(file_id, "processing")

        file_info = await storage_client.get_file_info(file_id)
        if not file_info:
            raise ValidationError(f"File {file_id} not found")

        blob_path = file_info["file_path"]
        file_name = file_info["file_name"]
        ext = Path(file_name).suffix.lower()

        # Display type determined by extension
        if ext in TABLE_EXTENSIONS:
            display_type = DisplayType.TABLE
        elif ext == ".md":
            display_type = DisplayType.TEXT
        else:
            display_type = DisplayType.DOCUMENT

        # 1. DOWNLOAD
        yield progress_event(file_id, "downloading", 0, "Downloading")
        if await request.is_disconnected() or is_cancelled():
            if is_cancelled():
                yield cancelled_event(file_id)
            return

        content = await storage_client.download_file(blob_path)
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as f:
            f.write(content)
            temp_path = f.name

        # 2. CONVERT
        yield progress_event(file_id, "parsing", 15, "Converting")
        if await request.is_disconnected() or is_cancelled():
            if is_cancelled():
                yield cancelled_event(file_id)
            return

        parse_path = temp_path
        pdf_bytes = None

        if ext in CONVERTIBLE_EXTENSIONS:
            pdf_bytes = await get_gotenberg_client().convert_to_pdf(temp_path)
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                f.write(pdf_bytes)
                converted_path = f.name
                parse_path = converted_path

        # 3. PARSE
        yield progress_event(file_id, "parsing", 35, "Parsing")
        if await request.is_disconnected() or is_cancelled():
            if is_cancelled():
                yield cancelled_event(file_id)
            return

        is_table = display_type == DisplayType.TABLE
        data = await parser.parse_document(parse_path)
        intake = parser.get_intake_content(data, is_table)

        # 4. ANALYZE
        yield progress_event(file_id, "analyzing", 55, "Analyzing")
        if await request.is_disconnected() or is_cancelled():
            if is_cancelled():
                yield cancelled_event(file_id)
            return

        meta = await parser.analyze_document_metadata(intake, file_name)

        # 5. INDEX
        yield progress_event(file_id, "uploading", 70, "Indexing")
        if await request.is_disconnected() or is_cancelled():
            if is_cancelled():
                yield cancelled_event(file_id)
            return

        result = parser.build_chunks(data, CitationFile(id=file_id, name=file_name))
        await cosmos_client.batch_upsert_documents(result.chunks, user_id, meta)

        # 6. SAVE
        yield progress_event(file_id, "finalizing", 85, "Saving")
        if await request.is_disconnected() or is_cancelled():
            if is_cancelled():
                yield cancelled_event(file_id)
            return

        if pdf_bytes:
            display_path = f"{blob_path}.pdf"
            await storage_client.upload_file(display_path, pdf_bytes)
        else:
            display_path = blob_path

        meta_dict = meta.model_dump()
        meta_dict["display_path"] = display_path
        meta_dict["display_type"] = display_type.value

        success = await storage_client.update_file_processing_results(
            file_id,
            meta_dict,
            result.content,
            result.sheets if is_table else None,
        )
        if not success:
            raise InternalServerError("Failed to save results")

        await storage_client.update_processing_status(file_id, "completed")

        yield {
            "event": "completed",
            "data": json.dumps({
                "file_id": file_id,
                "stage": "completed",
                "progress": 100,
                "message": "Done",
                "timestamp": time.time(),
            }),
        }

    except asyncio.CancelledError:
        logger.info(f"[SSE] File {file_id} task cancelled")
        await storage_client.update_processing_status(file_id, "cancelled")
        yield cancelled_event(file_id)
    except ConversionError as e:
        await storage_client.update_processing_status(file_id, "failed")
        yield error_event(file_id, f"Conversion failed: {e}")
    except Exception as e:
        logger.error(f"Processing error: {e}", exc_info=True)
        await storage_client.update_processing_status(file_id, "failed")
        yield error_event(file_id, str(e))
    finally:
        # Clean up temp files
        for path in [temp_path, converted_path]:
            if path and os.path.exists(path):
                os.unlink(path)

        # Only cleanup state if this is still our session
        current_state = file_jobs.get(file_id)
        if current_state and current_state.get("processing_id") == processing_id:
            file_jobs.pop(file_id, None)
            logger.info(f"[SSE] Cleanup complete for file {file_id}")
        else:
            logger.info(f"[SSE] Skipping cleanup for file {file_id} - newer session started")


@router.post("/{file_id}/processing")
async def init_file_processing(file_id: str, request: Request):
    """Initialize file processing and store state. Returns processingId."""
    user = get_user_from_request(request)
    user_id = user["user_id"]
    user_email = user["user_email"]

    # Verify file ownership
    file_info = await storage_client.get_file_info(file_id)
    if not file_info:
        raise ValidationError(f"File {file_id} not found")

    if str(file_info["user_id"]) != user_id:
        raise AuthenticationError("Access denied")

    # Generate processing ID on server
    processing_id = str(uuid4())

    # Clean up stale entries (no active processing, >5 min old)
    old_state = file_jobs.get(file_id)
    if old_state:
        age = time.time() - old_state["timestamp"]
        if age > 300:
            file_jobs.pop(file_id, None)

    # Store processing state
    file_jobs[file_id] = {
        "file_id": file_id,
        "processing_id": processing_id,
        "user_id": user_id,
        "cancelled": False,
        "timestamp": time.time(),
    }

    logger.info(f"AUDIT: User {user_email} initialized file processing. FileId={file_id}, ProcessingId={processing_id}")

    return {
        "fileId": file_id,
        "processingId": processing_id,
        "message": "File processing initialized",
        "streamUrl": f"/files/{file_id}/processing/stream",
    }


@router.get("/{file_id}/processing/stream")
async def process_file_stream(file_id: str, request: Request, token: str):
    """Stream file processing progress with SSE."""
    user = extract_user_from_token(token)
    user_id = user["user_id"]
    user_email = user["user_email"]

    # Get existing processing state
    job_state = file_jobs.get(file_id)
    if not job_state:
        raise ValidationError("File processing not initialized. Call POST first.")

    if job_state.get("user_id") != user_id:
        raise AuthenticationError("Access denied")

    processing_id = job_state["processing_id"]
    logger.info(f"AUDIT: User {user_email} started file processing stream. FileId={file_id}, ProcessingId={processing_id}")

    async def process_with_limits():
        async with file_semaphore:
            try:
                async with asyncio.timeout(600):
                    async for event in stream_file_processing(user_id, file_id, job_state, request):
                        yield event
            except asyncio.TimeoutError:
                logger.error(f"Processing timeout for file {file_id}")
                yield error_event(file_id, "Processing timeout - file too large or complex")
                await storage_client.update_processing_status(file_id, "failed")

    return EventSourceResponse(process_with_limits())


@router.delete("/{file_id}/processing")
async def abort_file_processing(file_id: str, request: Request):
    """Abort file processing. Requires processing_id to prevent race conditions."""
    user = get_user_from_request(request)
    user_id = user["user_id"]
    user_email = user["user_email"]

    body = await request.json()
    abort_request = FileAbortRequest(**body)
    processing_id = abort_request.processing_id

    logger.info(f"AUDIT: User {user_email} requested abort. FileId={file_id}, ProcessingId={processing_id}")

    if file_id not in file_jobs:
        return {"success": False, "message": "No active processing found"}

    current_state = file_jobs[file_id]

    # Validate user ownership
    if current_state.get("user_id") != user_id:
        raise AuthenticationError("Access denied")

    # Only cancel if processing_id matches
    if current_state.get("processing_id") != processing_id:
        return {"success": False, "message": "Processing session no longer active"}

    # Mark as cancelled
    current_state["cancelled"] = True
    await storage_client.update_processing_status(file_id, "cancelled")

    return {"success": True, "message": "Processing aborted"}


@router.delete("/{file_id}")
async def delete_file(file_id: str, request: Request):
    """Delete vectors for a file from vector database."""
    user = get_user_from_request(request)
    user_id = user["user_id"]
    user_email = user["user_email"]

    file_info = await storage_client.get_file_info(file_id)
    if not file_info:
        raise ValidationError(f"File {file_id} not found")

    if str(file_info["user_id"]) != user_id:
        raise AuthenticationError("Access denied")

    logger.info(f"AUDIT: User {user_email} deleted file vectors. FileId={file_id}")

    await cosmos_client.delete_file(file_id=file_id, namespace=user_id)

    return {"success": True, "message": "File vectors deleted", "file_id": file_id}
