"""Section processing and enhancement endpoints."""

import asyncio
import json
import logging
import time
from uuid import uuid4

from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse

from auth import extract_user_from_token, get_user_from_request, build_response
from conversational import Conversational
from pipeline import Pipeline
from state import section_semaphore, section_jobs
from core.exceptions import (
    ValidationError,
    AuthenticationError,
    InternalServerError,
    StudioError,
)
from schemas import SectionProcessRequest, SectionEnhanceRequest, SectionAbortRequest

logger = logging.getLogger(__name__)
router = APIRouter()

# Service clients
pipeline = Pipeline()
conversational = Conversational()


async def stream_section_processing(
    section_id: str, request_data: dict, request: Request
):
    """Process section and yield SSE events for progress."""
    # Store processing_id to check in finally block (prevents race condition with new runs)
    processing_id = request_data["processing_id"]
    user_id = request_data["user_id"]
    user_email = request_data["user_email"]
    section_name = request_data["section_name"]

    try:
        logger.info(f"[SSE] Starting section processing for section_id: {section_id}")
        logger.info(
            "AUDIT: User %s (%s) started SSE section processing stream. SectionId=%s",
            user_email,
            user_id,
            section_id,
        )

        # Check if already cancelled before starting
        if request_data.get("cancelled"):
            logger.info(f"[SSE] Section {section_id} already cancelled before starting")
            yield {
                "event": "cancelled",
                "data": json.dumps(
                    {
                        "sectionId": section_id,
                        "sectionName": section_name,
                        "message": "Cancelled",
                    }
                ),
            }
            return

        if await request.is_disconnected():
            return

        progress_queue: asyncio.Queue[dict] = asyncio.Queue()

        async def progress_callback(progress_data):
            if await request.is_disconnected():
                return False

            await progress_queue.put(
                {
                    "event": "progress",
                    "data": json.dumps(
                        {
                            "sectionId": section_id,
                            "sectionName": section_name,
                            **progress_data,
                            "timestamp": time.time(),
                        }
                    ),
                }
            )
            return True

        file_ids = request_data["file_ids"]
        section_description = request_data["section_description"]
        template_description = request_data["template_description"]
        project_description = request_data["project_description"]
        output_format = request_data["output_format"]
        dependent_section_results = request_data.get("dependent_section_results")

        pipeline_task = asyncio.create_task(
            pipeline.run_with_progress(
                section_id=section_id,
                file_ids=file_ids,
                section_name=section_name,
                section_description=section_description,
                template_description=template_description,
                project_description=project_description,
                output_format=output_format,
                dependent_section_results=dependent_section_results,
                progress_callback=progress_callback,
            )
        )

        section_jobs[section_id]["task"] = pipeline_task

        while True:
            if request_data.get("cancelled"):
                logger.info(
                    f"[SSE] Section {section_id} cancellation detected - cancelling task"
                )
                if not pipeline_task.done():
                    pipeline_task.cancel()
                    try:
                        await asyncio.wait_for(pipeline_task, timeout=0.5)
                    except (asyncio.CancelledError, asyncio.TimeoutError):
                        pass
                yield {
                    "event": "cancelled",
                    "data": json.dumps(
                        {
                            "sectionId": section_id,
                            "sectionName": section_name,
                            "stage": "cancelled",
                            "progress": 0,
                            "message": "Cancelled",
                            "timestamp": time.time(),
                        }
                    ),
                }
                break

            if pipeline_task.done():
                try:
                    result = await pipeline_task

                    yield {
                        "event": "completed",
                        "data": json.dumps(
                            {
                                "sectionId": section_id,
                                "sectionName": section_name,
                                "stage": "completed",
                                "progress": 100,
                                "message": "Complete",
                                "timestamp": time.time(),
                                "result": result.model_dump(),
                            }
                        ),
                    }
                    break
                except asyncio.CancelledError:
                    logger.info(f"[SSE] Section {section_id} task cancelled")
                    yield {
                        "event": "cancelled",
                        "data": json.dumps(
                            {
                                "sectionId": section_id,
                                "sectionName": section_name,
                                "stage": "cancelled",
                                "progress": 0,
                                "message": "Cancelled",
                                "timestamp": time.time(),
                            }
                        ),
                    }
                    break
                except Exception as e:
                    raise e

            try:
                event = await asyncio.wait_for(progress_queue.get(), timeout=0.1)
                yield event
            except asyncio.TimeoutError:
                continue

    except Exception as e:
        if "cancelled by user" in str(e).lower():
            logger.info(f"[SSE] Section {section_id} cancelled by user")
            yield {
                "event": "cancelled",
                "data": json.dumps(
                    {
                        "sectionId": section_id,
                        "sectionName": section_name,
                        "stage": "cancelled",
                        "progress": 0,
                        "message": "Cancelled",
                        "timestamp": time.time(),
                    }
                ),
            }
        else:
            logger.error(
                f"[SSE] Error processing section {section_id}: {str(e)}", exc_info=True
            )
            yield {
                "event": "error",
                "data": json.dumps(
                    {
                        "sectionId": section_id,
                        "stage": "error",
                        "progress": 0,
                        "message": "Failed",
                        "error": str(e),
                        "timestamp": time.time(),
                    }
                ),
            }
    finally:
        if "pipeline_task" in locals() and not pipeline_task.done():
            logger.info(
                f"[SSE] Cleaning up - cancelling pipeline task for section {section_id}"
            )
            pipeline_task.cancel()
            try:
                await pipeline_task
            except asyncio.CancelledError:
                pass
        # Only cleanup state if this is still our session (prevents race condition with new runs)
        current_state = section_jobs.get(section_id)
        if current_state and current_state.get("processing_id") == processing_id:
            section_jobs.pop(section_id, None)
            logger.info(f"[SSE] Cleanup complete for section {section_id}")
        else:
            logger.info(
                f"[SSE] Skipping cleanup for section {section_id} - newer session started"
            )


@router.post("/{section_id}/processing")
async def init_section_processing(section_id: str, request: Request):
    """Initialize section processing and store request data."""
    try:
        body = await request.json()
        request_body = SectionProcessRequest(**body)

        user = get_user_from_request(request)
        user_id = user["user_id"]
        user_email = user["user_email"]

        project_desc = request_body.project_metadata["description"]

        # Generate unique processing ID to prevent race conditions
        processing_id = str(uuid4())

        # Clean up stale entries (no task, >5 min old)
        old_state = section_jobs.get(section_id)
        if old_state and not old_state.get("task"):
            age = time.time() - old_state["timestamp"]
            if age > 300:
                section_jobs.pop(section_id, None)
                logger.info(
                    f"Cleaned up stale state for section {section_id} (age: {age:.1f}s)"
                )

        # Store processing state
        section_jobs[section_id] = {
            "section_id": section_id,
            "processing_id": processing_id,
            "user_id": user_id,
            "user_email": user_email,
            "file_ids": [str(fid) for fid in request_body.file_ids],
            "section_name": request_body.section_name,
            "section_description": request_body.section_description,
            "template_description": request_body.template_metadata["description"],
            "project_description": project_desc,
            "output_format": request_body.output_format,
            "dependent_section_results": (
                [
                    {
                        "section_id": dep.section_id,
                        "section_name": dep.section_name,
                        "section_type": dep.section_type,
                        "response": dep.response,
                    }
                    for dep in request_body.dependent_section_results
                ]
                if request_body.dependent_section_results
                else None
            ),
            "cancelled": False,
            "timestamp": time.time(),
        }

        logger.info(
            "AUDIT: User %s (%s) started section processing. SectionId=%s, Files=%s",
            user_email,
            user_id,
            section_id,
            request_body.file_ids,
        )

        logger.info(f"Section processing initialized for section_id: {section_id}")

        return {
            "sectionId": section_id,
            "processingId": processing_id,
            "message": "Section processing initialized",
            "streamUrl": f"/sections/{section_id}/processing/stream",
        }

    except StudioError:
        raise
    except Exception as e:
        raise InternalServerError(f"Failed to initialize section processing: {str(e)}")


@router.get("/{section_id}/processing/stream")
async def process_section_stream(section_id: str, request: Request, token: str):
    """
    Stream section processing progress with SSE.
    Accepts token as query parameter for EventSource compatibility.
    """
    # Decode user for audit (no strict owner check here, APIM already validated)
    user = extract_user_from_token(token)
    user_id = user["user_id"]
    user_email = user["user_email"]

    request_data = section_jobs.get(section_id)
    if not request_data:
        raise ValidationError("Section processing request not found")

    logger.info(
        "AUDIT: User %s (%s) opened section SSE stream. SectionId=%s",
        user_email,
        user_id,
        section_id,
    )

    async def process_with_limits():
        async with section_semaphore:
            try:
                async with asyncio.timeout(300):
                    async for event in stream_section_processing(
                        section_id, request_data, request
                    ):
                        yield event
            except asyncio.TimeoutError:
                logger.error(f"Processing timeout for section {section_id}")
                yield {
                    "event": "error",
                    "data": json.dumps(
                        {
                            "sectionId": section_id,
                            "error": "Processing timeout - section processing took too long",
                            "timestamp": time.time(),
                        }
                    ),
                }

    return EventSourceResponse(process_with_limits())


@router.delete("/{section_id}/processing")
async def abort_section_processing(section_id: str, request: Request):
    """Abort section processing."""
    user = get_user_from_request(request)
    user_id = user["user_id"]
    user_email = user["user_email"]

    body = await request.json()
    abort_request = SectionAbortRequest(**body)
    processing_id = abort_request.processing_id

    logger.info(
        "AUDIT: User %s (%s) requested abort for section processing. SectionId=%s, ProcessingId=%s",
        user_email,
        user_id,
        section_id,
        processing_id,
    )

    if section_id in section_jobs:
        current_state = section_jobs[section_id]

        # Validate user ownership
        if current_state.get("user_id") != user_id:
            logger.warning(
                f"Abort denied for section {section_id} - user {user_id} does not own this processing session"
            )
            raise AuthenticationError("Access denied")

        # Only cancel if processing_id matches
        if current_state.get("processing_id") != processing_id:
            logger.info(
                f"Abort skipped for section {section_id} - processing_id mismatch"
            )
            return {"success": False, "message": "Processing session no longer active"}

        current_state["cancelled"] = True

        task = current_state.get("task")
        if task and not task.done():
            task.cancel()
            logger.info(f"Cancelled running task for section {section_id}")
        else:
            logger.info(
                f"Marked section {section_id} for cancellation (task not started or already done)"
            )

        return {"success": True, "message": "Section processing aborted"}

    return {"success": False, "message": "No active processing found for section"}


@router.patch("/{section_id}")
async def enhance_section(section_id: str, request: Request):
    """Enhance/refine a section description based on user feedback."""
    try:
        body = await request.json()
        request_body = SectionEnhanceRequest(**body)

        user = get_user_from_request(request)
        user_id = user["user_id"]
        user_email = user["user_email"]

        logger.info(
            "AUDIT: User %s (%s) requested section enhancement. SectionId=%s, SectionName=%s",
            user_email,
            user_id,
            section_id,
            request_body.section_name,
        )

        enhanced_description = await conversational.refine_section_description(
            current_description=request_body.description,
            section_name=request_body.section_name,
            section_type=request_body.section_type,
            user_feedback=request_body.feedback,
        )

        logger.info("Successfully enhanced section description for user: %s", user_id)

        result_data = {
            "section_id": section_id,
            "original_description": request_body.description,
            "enhanced_description": enhanced_description,
        }

        return build_response(result_data, user_id)

    except StudioError:
        raise
    except Exception as e:
        raise InternalServerError(f"Failed to enhance section description: {str(e)}")
