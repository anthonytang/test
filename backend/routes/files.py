"""File processing endpoints."""

import asyncio
import json
import logging
import os
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse

from auth import extract_user_from_token, get_user_from_request
from clients import get_cosmos_client, get_storage_client, get_gotenberg_client
from pipeline import get_parser
from core import File as CitationFile, DisplayType
from core.config import CONVERTIBLE_EXTENSIONS, TABLE_EXTENSIONS
from state import file_semaphore
from core.exceptions import (
    ValidationError,
    AuthenticationError,
    InternalServerError,
    ConversionError,
    StudioError,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Service clients
cosmos_client = get_cosmos_client()
storage_client = get_storage_client()
parser = get_parser()


def progress_event(file_id: str, progress: int, message: str) -> dict:
    """Create a progress SSE event."""
    return {
        "event": "progress",
        "data": json.dumps({
            "file_id": file_id,
            "progress": progress,
            "message": message,
        }),
    }


def error_event(file_id: str, error: str) -> dict:
    """Create an error SSE event."""
    return {
        "event": "error",
        "data": json.dumps({
            "file_id": file_id,
            "error": error,
            "timestamp": time.time(),
        }),
    }


async def stream_file_processing(user_id: str, file_id: str, request: Request):
    """Process file: Download → Convert → Parse → Analyze → Index → Save"""
    temp_path = None
    converted_path = None

    try:
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
        yield progress_event(file_id, 0, "Downloading")
        if await request.is_disconnected():
            return

        content = await storage_client.download_file(blob_path)
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as f:
            f.write(content)
            temp_path = f.name

        # 2. CONVERT (Word/PPT → PDF)
        yield progress_event(file_id, 15, "Converting")
        if await request.is_disconnected():
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
        yield progress_event(file_id, 35, "Parsing")
        if await request.is_disconnected():
            return

        is_table = display_type == DisplayType.TABLE
        data = await parser.parse_document(parse_path)
        intake = parser.get_intake_content(data, is_table)

        # 4. ANALYZE
        yield progress_event(file_id, 55, "Analyzing")
        if await request.is_disconnected():
            return

        meta = await parser.analyze_document_metadata(intake, file_name)

        # 5. INDEX
        yield progress_event(file_id, 70, "Indexing")
        if await request.is_disconnected():
            return

        result = parser.build_chunks(data, CitationFile(id=file_id, name=file_name))
        await cosmos_client.batch_upsert_documents(result.chunks, user_id, meta)

        # 6. SAVE
        yield progress_event(file_id, 85, "Saving")
        if await request.is_disconnected():
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

        yield {"event": "completed", "data": json.dumps({"file_id": file_id, "progress": 100, "message": "Done"})}

    except asyncio.CancelledError:
        raise
    except ConversionError as e:
        await storage_client.update_processing_status(file_id, "failed")
        yield error_event(file_id, f"Conversion failed: {e}")
    except Exception as e:
        logger.error(f"Processing error: {e}", exc_info=True)
        await storage_client.update_processing_status(file_id, "failed")
        yield error_event(file_id, str(e))
    finally:
        for path in [temp_path, converted_path]:
            if path and os.path.exists(path):
                os.unlink(path)


@router.get("/{file_id}/processing/stream")
async def process_file_stream(file_id: str, request: Request, token: str):
    """
    Stream file processing progress with SSE.
    Accepts token as query parameter for EventSource compatibility.
    """
    user = extract_user_from_token(token)
    user_id = user["user_id"]
    user_email = user["user_email"]

    # Verify file ownership
    file_info = await storage_client.get_file_info(file_id)
    if not file_info:
        raise ValidationError(f"File {file_id} not found")

    if str(file_info["user_id"]) != user_id:
        raise AuthenticationError("Access denied")

    logger.info(
        "AUDIT: User %s (%s) opened file SSE stream. FileId=%s",
        user_email,
        user_id,
        file_id,
    )

    async def process_with_limits():
        async with file_semaphore:
            try:
                async with asyncio.timeout(600):
                    async for event in stream_file_processing(
                        user_id, file_id, request
                    ):
                        yield event
            except asyncio.TimeoutError:
                logger.error(f"Processing timeout for file {file_id}")
                yield {
                    "event": "error",
                    "data": json.dumps(
                        {
                            "file_id": file_id,
                            "error": "Processing timeout - file too large or complex",
                            "timestamp": time.time(),
                        }
                    ),
                }
                try:
                    await storage_client.update_processing_status(file_id, "failed")
                except Exception:
                    pass

    return EventSourceResponse(process_with_limits())


@router.delete("/{file_id}/processing")
async def abort_file_processing(file_id: str, request: Request):
    """Abort file processing."""
    user = get_user_from_request(request)
    user_id = user["user_id"]
    user_email = user["user_email"]

    # Verify file ownership
    file_info = await storage_client.get_file_info(file_id)
    if not file_info:
        raise ValidationError(f"File {file_id} not found")

    if str(file_info["user_id"]) != user_id:
        raise AuthenticationError("Access denied")

    logger.info(
        "AUDIT: User %s (%s) requested file processing abort. FileId=%s",
        user_email,
        user_id,
        file_id,
    )

    try:
        await storage_client.update_processing_status(file_id, "cancelled")
        return {"success": True, "message": "Processing aborted"}
    except StudioError:
        raise
    except Exception as e:
        logger.error(f"Error aborting processing for file {file_id}: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to abort processing: {str(e)}",
        }


@router.delete("/{file_id}")
async def delete_file(file_id: str, request: Request):
    """Delete vectors for a file from vector database."""
    user = get_user_from_request(request)
    user_id = user["user_id"]
    user_email = user["user_email"]

    # Verify file ownership
    file_info = await storage_client.get_file_info(file_id)
    if not file_info:
        raise ValidationError(f"File {file_id} not found")

    if str(file_info["user_id"]) != user_id:
        raise AuthenticationError("Access denied")

    try:
        logger.info(
            "AUDIT: User %s (%s) deleted file vectors. FileId=%s",
            user_email,
            user_id,
            file_id,
        )

        await cosmos_client.delete_file(file_id=file_id, namespace=user_id)

        return {
            "success": True,
            "message": "File vectors deleted successfully",
            "file_id": file_id,
            "timestamp": time.time(),
        }
    except Exception as e:
        raise InternalServerError(f"Failed to delete vectors: {str(e)}")
