"""Authentication helpers for Studio API."""

import base64
import json
import logging
import time
from typing import Any

from fastapi import Request

from core.exceptions import AuthenticationError

logger = logging.getLogger(__name__)


def decode_jwt_payload(token: str) -> dict[str, Any]:
    """
    Decode a JWT payload without verifying the signature.
    This is safe here because APIM has already validated the token.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise AuthenticationError("Invalid token format")

        payload_encoded = parts[1]
        padding = "=" * (-len(payload_encoded) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_encoded + padding)
        return json.loads(payload_bytes.decode("utf-8"))
    except AuthenticationError:
        raise
    except Exception as e:
        logger.warning(f"Failed to decode JWT payload: {e}")
        raise AuthenticationError(f"Invalid token: {str(e)}")


def extract_user_from_token(token: str) -> dict[str, str]:
    """Extract user info from JWT token."""
    payload = decode_jwt_payload(token)
    # Azure AD tokens use 'oid' (object ID) as the user identifier
    user_id = payload["oid"]
    # Azure AD uses 'preferred_username' for the user's email/UPN
    user_email = payload["preferred_username"]

    return {"user_id": user_id, "user_email": user_email}


def get_user_from_request(request: Request) -> dict[str, str]:
    """Extract user from Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise AuthenticationError("Authorization required")

    token = auth_header.split(" ", 1)[1]
    return extract_user_from_token(token)


def build_response(data: Any, user_id: str) -> dict[str, Any]:
    """Build standardized API response."""
    return {
        "success": True,
        "data": data,
        "metadata": {
            "user_id": str(user_id),
            "timestamp": time.time(),
        },
    }
