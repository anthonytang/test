"""Health check and debug endpoints."""

import logging
import time
from typing import Any, Dict

from fastapi import APIRouter, Request

from auth import get_user_from_request
from clients import get_cosmos_client
from core.config import (
    COSMOS_MONGODB_CONNECTION_STRING,
    COSMOS_DATABASE_NAME,
    COSMOS_COLLECTION_NAME,
    EMBEDDING_MODEL_NAME,
    USE_REDIS,
)
from state import state_manager

logger = logging.getLogger(__name__)
router = APIRouter()

# Service clients
cosmos_client = get_cosmos_client()


@router.get("/health")
@router.head("/health")
async def health_check():
    """Health check endpoint with Redis monitoring support."""
    health_status = {
        "status": "healthy",
        "timestamp": time.time(),
        "mode": "redis" if USE_REDIS else "memory"
    }
    
    # Check Redis connectivity if feature flag is on
    if USE_REDIS:
        try:
            # Simple ping test through state manager store
            await state_manager.store.set("_health_check", "ok", expire=10)
            val = await state_manager.store.get("_health_check")
            if val != "ok":
                raise Exception("Redis data mismatch")
            health_status["redis"] = "connected"
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            health_status["status"] = "degraded"
            health_status["redis"] = f"error: {str(e)}"
            
    return health_status


@router.get("/debug/cosmos")
async def debug_cosmos(request: Request):
    """
    Diagnostic endpoint to check Cosmos DB connection and vector index status.
    """
    try:
        user = get_user_from_request(request)
        user_id = user["user_id"]
        logger.info(f"AUDIT: User {user_id} accessed /debug/cosmos")
    except Exception:
        pass

    diagnostics: Dict[str, Any] = {
        "timestamp": time.time(),
        "status": "checking",
        "checks": {},
    }

    # 1. Check environment variables
    env_checks = {
        "COSMOS_MONGODB_CONNECTION_STRING": bool(COSMOS_MONGODB_CONNECTION_STRING),
        "COSMOS_DATABASE_NAME": COSMOS_DATABASE_NAME,
        "COSMOS_COLLECTION_NAME": COSMOS_COLLECTION_NAME,
        "EMBEDDING_MODEL_NAME": EMBEDDING_MODEL_NAME or "NOT SET",
        "USE_REDIS": USE_REDIS
    }
    diagnostics["checks"]["environment"] = env_checks

    # 2. Check Cosmos connection
    try:
        stats = cosmos_client.collection.estimated_document_count()
        diagnostics["checks"]["cosmos_connection"] = {
            "status": "connected",
            "database": cosmos_client.database_name,
            "collection": cosmos_client.collection_name,
            "document_count": stats,
        }
    except Exception as e:
        diagnostics["checks"]["cosmos_connection"] = {
            "status": "failed",
            "error": str(e),
        }
        diagnostics["status"] = "error"
        return diagnostics

    # 3. Check vector index exists
    try:
        indexes = list(cosmos_client.collection.list_indexes())
        index_names = [idx["name"] for idx in indexes]
        has_vector_index = any(
            "vector" in name.lower() or "cosmosSearch" in str(idx)
            for name, idx in zip(index_names, indexes)
        )

        diagnostics["checks"]["indexes"] = {
            "status": "ok" if has_vector_index else "warning",
            "index_names": index_names,
            "has_vector_index": has_vector_index,
        }
    except Exception as e:
        diagnostics["checks"]["indexes"] = {"status": "error", "error": str(e)}

    # Final status
    if diagnostics["status"] != "error":
        all_ok = all(
            check.get("status") in ["ok", "connected"]
            for check in diagnostics["checks"].values()
        )
        diagnostics["status"] = "healthy" if all_ok else "degraded"

    return diagnostics