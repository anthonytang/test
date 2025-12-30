"""File processing endpoints."""

import asyncio
import json
import logging
import os
import tempfile
import time

from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse

from auth import extract_user_from_token, get_user_from_request
from clients import get_cosmos_client, get_storage_client
from pipeline import get_parser
from core import File as CitationFile
from state import file_semaphore
from core.exceptions import (
    ValidationError,
    AuthenticationError,
    InternalServerError,
    StudioError,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Service clients
cosmos_client = get_cosmos_client()
storage_client = get_storage_client()
parser = get_parser()


async def stream_file_processing(user_id: str, file_id: str, request: Request):
    """Process file and yield SSE events for progress."""
    try:
        logger.info(f"[SSE] Starting processing generator for file {file_id}")
        await storage_client.update_processing_status(file_id, "processing")

        yield {
            "event": "progress",
            "data": json.dumps(
                {"file_id": file_id, "progress": 0, "message": "Downloading"}
            ),
        }

        file_info = await storage_client.get_file_info(file_id)
        if not file_info:
            raise ValidationError(f"File {file_id} not found")

        if await request.is_disconnected():
            return

        file_content = await storage_client.download_file(file_info["file_path"])

        with tempfile.NamedTemporaryFile(
            delete=False, suffix=os.path.splitext(file_info["file_name"])[1]
        ) as temp_file:
            temp_file.write(file_content)
            temp_path = temp_file.name

        try:
            yield {
                "event": "progress",
                "data": json.dumps(
                    {"file_id": file_id, "progress": 20, "message": "Parsing"}
                ),
            }

            if await request.is_disconnected():
                return

            page_data, intake_content = await parser.parse_document(
                temp_path, file_info["file_name"]
            )

            yield {
                "event": "progress",
                "data": json.dumps(
                    {"file_id": file_id, "progress": 45, "message": "Analyzing"}
                ),
            }

            if await request.is_disconnected():
                return

            meta = await parser.analyze_document_metadata(
                intake_content, file_info["file_name"]
            )
            file = CitationFile(id=file_id, name=file_info["file_name"])
            result = parser.build_chunks(page_data, file)

            yield {
                "event": "progress",
                "data": json.dumps(
                    {"file_id": file_id, "progress": 65, "message": "Indexing"}
                ),
            }

            if await request.is_disconnected():
                return

            await cosmos_client.batch_upsert_documents(result.chunks, user_id, meta)

            try:
                success = await storage_client.update_file_processing_results(
                    file_id,
                    meta,
                    result.content,
                    result.sheets if result.sheets else None,
                )

                if not success:
                    raise InternalServerError(
                        "Failed to update file processing results"
                    )

                await storage_client.update_processing_status(file_id, "completed")
            except Exception as db_error:
                logger.error(
                    f"DB update failed after vector upsert, cleaning up: {db_error}"
                )
                try:
                    await cosmos_client.delete_file(file_id, user_id)
                except Exception:
                    pass
                raise

            yield {
                "event": "completed",
                "data": json.dumps(
                    {"file_id": file_id, "progress": 100, "message": "Done"}
                ),
            }

        finally:
            if os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass

    except asyncio.CancelledError:
        raise
    except Exception as e:
        try:
            await storage_client.update_processing_status(file_id, "failed")
        except Exception:
            pass

        yield {
            "event": "error",
            "data": json.dumps(
                {
                    "file_id": file_id,
                    "error": str(e),
                    "timestamp": time.time(),
                }
            ),
        }


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
