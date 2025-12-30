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
from state import section_semaphore, section_tasks, state_manager
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
    # Fetch latest persistent state
    job_state = await state_manager.get_job_state("section", section_id)
    if not job_state:
        yield {"event": "error", "data": json.dumps({"error": "Processing state not found"})}
        return

    processing_id = job_state["processing_id"]
    user_id = job_state["user_id"]
    user_email = job_state["user_email"]
    section_name = job_state["section_name"]

    try:
        logger.info(f"[SSE] Starting section processing for section_id: {section_id}")
        logger.info(
            "AUDIT: User %s (%s) started SSE section processing stream. SectionId=%s",
            user_email,
            user_id,
            section_id,
        )

        # If state exists and is already completed, return immediately
        if job_state.get("status") == "completed" and "result" in job_state:
            logger.info(f"[SSE] Section {section_id} already completed, returning stored result")
            yield {
                "event": "completed",
                "data": json.dumps({
                    "sectionId": section_id,
                    "sectionName": section_name,
                    "stage": "completed",
                    "progress": 100,
                    "message": "Complete",
                    "timestamp": time.time(),
                    "result": job_state["result"],
                }),
            }
            return

        # Check persistent cancellation flag
        if job_state.get("cancelled"):
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
            
            # Persist progress to Redis
            await state_manager.update_progress(
                "section", section_id, 
                progress_data.get("progress", 0), 
                progress_data.get("message", "")
            )

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

        file_ids = job_state["file_ids"]
        section_description = job_state["section_description"]
        template_description = job_state["template_description"]
        project_description = job_state["project_description"]
        output_format = job_state["output_format"]
        dependent_section_results = job_state.get("dependent_section_results")

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

        section_tasks[section_id] = pipeline_task

        while True:
            # Check persistent cancellation in loop
            current_job_state = await state_manager.get_job_state("section", section_id)
            if current_job_state and current_job_state.get("cancelled"):
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

                    # Persist final completion status AND result to state manager
                    await state_manager.update_progress(
                        "section", section_id, 100, "Complete", 
                        extra={"status": "completed", "result": result.model_dump()}
                    )

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
        
        # Cleanup persistent and local state if this is our session
        current_state = await state_manager.get_job_state("section", section_id)
        if current_state and current_state.get("processing_id") == processing_id:
            await state_manager.delete_job_state("section", section_id)
            section_tasks.pop(section_id, None)
            logger.info(f"[SSE] Cleanup complete for section {section_id}")


@router.post("/{section_id}/processing")
async def init_section_processing(section_id: str, request: Request):
    """Initialize section processing and store persistent request data."""
    try:
        body = await request.json()
        request_body = SectionProcessRequest(**body)

        user = get_user_from_request(request)
        user_id = user["user_id"]
        user_email = user["user_email"]

        project_desc = request_body.project_metadata["description"]
        processing_id = str(uuid4())

        # Store persistent state in manager
        job_data = {
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
        
        await state_manager.set_job_state("section", section_id, job_data)

        logger.info(
            "AUDIT: User %s (%s) started section processing. SectionId=%s, Files=%s",
            user_email,
            user_id,
            section_id,
            request_body.file_ids,
        )

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
    """
    user = extract_user_from_token(token)
    user_id = user["user_id"]
    user_email = user["user_email"]

    # Fetch from persistent state manager instead of dict
    request_data = await state_manager.get_job_state("section", section_id)
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

    job_state = await state_manager.get_job_state("section", section_id)
    if job_state:
        # Validate user ownership
        if job_state.get("user_id") != user_id:
            logger.warning(
                f"Abort denied for section {section_id} - user {user_id} does not own session"
            )
            raise AuthenticationError("Access denied")

        # Only cancel if processing_id matches
        if job_state.get("processing_id") != processing_id:
            return {"success": False, "message": "Processing session no longer active"}

        # Mark as cancelled in persistent storage
        job_state["cancelled"] = True
        await state_manager.set_job_state("section", section_id, job_state)

        # Cancel the task on this server instance if it exists
        task = section_tasks.get(section_id)
        if task and not task.done():
            task.cancel()
            logger.info(f"Cancelled running task for section {section_id}")

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
