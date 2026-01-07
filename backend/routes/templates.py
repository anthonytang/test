"""Template generation and extraction endpoints."""

import json
import logging
import os
import tempfile
from datetime import datetime

from fastapi import APIRouter, Request
from sse_starlette import EventSourceResponse

from auth import get_user_from_request, extract_user_from_token, build_response
from clients import get_storage_client
from conversational import Conversational
from extraction import TemplateExtractor
from state import extraction_jobs
from core.exceptions import (
    ValidationError,
    AuthenticationError,
    AIError,
    StudioError,
)
from schemas import TemplateGenerateRequest

logger = logging.getLogger(__name__)
router = APIRouter()

# Service clients
storage_client = get_storage_client()
conversational = Conversational()


@router.post("")
async def generate_template(request_body: TemplateGenerateRequest, request: Request):
    """Generate a template from natural language description."""
    try:
        user = get_user_from_request(request)
        user_id = user["user_id"]
        user_email = user["user_email"]

        logger.info(
            "AUDIT: User %s (%s) requested template generation",
            user_email,
            user_id,
        )

        template_data = await conversational.parse_template_request(
            user_input=request_body.description,
            project_name=request_body.project_name,
            project_description=request_body.project_description,
            project_metadata=request_body.project_metadata,
        )

        logger.info(
            "Successfully generated template (user: %s)",
            user_id,
        )

        return build_response(template_data, user_id)

    except StudioError:
        raise
    except Exception as e:
        raise AIError(f"Failed to generate template: {str(e)}")


@router.get("/extractions/{file_id}/stream")
async def stream_template_extraction(file_id: str, request: Request, token: str):
    """
    Extract a template from an uploaded document file using SSE for progress.
    Accepts token as query parameter for EventSource compatibility.
    """
    user = extract_user_from_token(token)
    user_id = user["user_id"]
    user_email = user["user_email"]

    logger.info(
        "AUDIT: User %s (%s) started template extraction. FileId=%s",
        user_email,
        user_id,
        file_id,
    )

    generation_id = f"{user_id}_{file_id}_{datetime.now().isoformat()}"
    extraction_jobs[generation_id] = {"cancelled": False}

    async def stream_extraction_events():
        """Generator for SSE events during template extraction."""
        try:
            state = extraction_jobs.get(generation_id)
            if state and state.get("cancelled"):
                yield {
                    "event": "cancelled",
                    "data": json.dumps({"message": "Cancelled"}),
                }
                return

            file_info = await storage_client.get_file_info(file_id)
            if not file_info:
                raise ValidationError(f"File {file_id} not found")

            if str(file_info["user_id"]) != user_id:
                raise AuthenticationError("Access denied to file")

            file_content = await storage_client.download_file(file_info["file_path"])

            file_name = file_info["file_name"]
            file_ext = os.path.splitext(file_name)[1]

            with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
                tmp_file.write(file_content)
                tmp_file_path = tmp_file.name

            try:
                extractor = TemplateExtractor()
                async for event in extractor.generate_template_from_document(tmp_file_path):
                    state = extraction_jobs.get(generation_id)
                    if state and state.get("cancelled"):
                        yield {
                            "event": "cancelled",
                            "data": json.dumps({"message": "Cancelled"}),
                        }
                        break

                    if event["event"] == "progress":
                        yield {
                            "event": "progress",
                            "data": json.dumps(
                                {
                                    "progress": event["data"]["progress"],
                                    "message": event["data"]["message"],
                                }
                            ),
                        }
                    elif event["event"] == "complete":
                        yield {
                            "event": "complete",
                            "data": json.dumps(
                                {
                                    "progress": 100,
                                    "message": "Complete",
                                    "template": event["data"]["template"],
                                }
                            ),
                        }

            finally:
                if os.path.exists(tmp_file_path):
                    os.remove(tmp_file_path)

        except StudioError as e:
            yield {
                "event": "error",
                "data": json.dumps(
                    {"error": e.message, "error_type": e.__class__.__name__}
                ),
            }
        except Exception as e:
            logger.error(
                f"[TEMPLATE EXTRACTION] Error extracting template from file {file_id}: {str(e)}",
                exc_info=True,
            )
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }
        finally:
            extraction_jobs.pop(generation_id, None)

    return EventSourceResponse(stream_extraction_events())


@router.delete("/extractions/{file_id}")
async def abort_template_extraction(file_id: str, request: Request):
    """Abort template extraction for a file."""
    user = get_user_from_request(request)
    user_id = user["user_id"]
    user_email = user["user_email"]

    logger.info(
        "AUDIT: User %s (%s) requested template extraction abort. FileId=%s",
        user_email,
        user_id,
        file_id,
    )

    cancelled_count = 0
    for gen_id in list(extraction_jobs.keys()):
        if gen_id.startswith(f"{user_id}_{file_id}_"):
            extraction_jobs[gen_id]["cancelled"] = True
            cancelled_count += 1
            logger.info("[TEMPLATE EXTRACTION] Marked %s for cancellation", gen_id)

    if cancelled_count > 0:
        return {
            "success": True,
            "message": f"Template extraction cancelled ({cancelled_count} active)",
        }
    else:
        return {
            "success": True,
            "message": "No active template extraction to cancel",
        }
