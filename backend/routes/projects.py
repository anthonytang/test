"""Project management endpoints."""

import logging

from fastapi import APIRouter, Request

from auth import get_user_from_request, build_response
from conversational import Conversational
from core.exceptions import InternalServerError, StudioError
from schemas import ProjectCreateRequest

logger = logging.getLogger(__name__)
router = APIRouter()

# Service clients
conversational = Conversational()


@router.post("")
async def create_project(request_body: ProjectCreateRequest, request: Request):
    """Create a project from natural language description."""
    try:
        user = get_user_from_request(request)
        user_id = user["user_id"]
        user_email = user["user_email"]

        logger.info(
            "AUDIT: User %s (%s) requested project creation",
            user_email,
            user_id,
        )

        project_data = await conversational.parse_project_request(
            user_input=request_body.description,
        )

        logger.info(
            "Successfully created project: %s for user %s",
            project_data["name"],
            user_id,
        )

        return build_response(project_data, user_id)

    except StudioError:
        raise
    except Exception as e:
        raise InternalServerError(f"Failed to create project: {str(e)}")
