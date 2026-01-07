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
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Service clients
cosmos_client = get_cosmos_client()


@router.get("/health")
@router.head("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "timestamp": time.time()}


@router.get("/debug/cosmos")
async def debug_cosmos(request: Request):
    """
    Diagnostic endpoint to check Cosmos DB connection and vector index status.
    Use this to debug "No chunks retrieved" errors on new deployments.
    """
    try:
        user = get_user_from_request(request)
        user_id = user["user_id"]
        logger.info(f"AUDIT: User {user_id} accessed /debug/cosmos")
    except Exception:
        # Allow unauthenticated access for initial debugging
        pass

    diagnostics: Dict[str, Any] = {
        "timestamp": time.time(),
        "status": "checking",
        "checks": {},
    }

    # 1. Check environment variables (from config)
    env_checks = {
        "COSMOS_MONGODB_CONNECTION_STRING": bool(COSMOS_MONGODB_CONNECTION_STRING),
        "COSMOS_DATABASE_NAME": COSMOS_DATABASE_NAME,
        "COSMOS_COLLECTION_NAME": COSMOS_COLLECTION_NAME,
        "EMBEDDING_MODEL_NAME": EMBEDDING_MODEL_NAME or "NOT SET",
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
            "warning": (
                None
                if has_vector_index
                else "Vector index may not be configured. Create it via Azure Portal."
            ),
        }
    except Exception as e:
        diagnostics["checks"]["indexes"] = {"status": "error", "error": str(e)}

    # 4. Sample documents to verify structure
    try:
        sample_docs = list(cosmos_client.collection.find({}).limit(3))
        if sample_docs:
            sample_info = []
            for doc in sample_docs:
                sample_info.append(
                    {
                        "id": str(doc["_id"]),
                        "file_id": doc["file_id"],
                        "file_name": doc["file_name"],
                        "has_embedding": "embedding" in doc
                        and len(doc["embedding"]) > 0,
                        "user_id": doc["user_id"],
                    }
                )
            diagnostics["checks"]["sample_documents"] = {
                "status": "ok",
                "count": len(sample_docs),
                "samples": sample_info,
            }
        else:
            diagnostics["checks"]["sample_documents"] = {
                "status": "warning",
                "count": 0,
                "message": "No documents found in collection. Files need to be uploaded and processed first.",
            }
    except Exception as e:
        diagnostics["checks"]["sample_documents"] = {"status": "error", "error": str(e)}

    # 5. Test embedding generation
    try:
        test_embedding = await cosmos_client.get_embeddings("test query")
        diagnostics["checks"]["embedding_service"] = {
            "status": "ok",
            "embedding_dimensions": len(test_embedding),
        }
    except Exception as e:
        diagnostics["checks"]["embedding_service"] = {
            "status": "error",
            "error": str(e),
        }
        diagnostics["status"] = "error"

    # Final status
    if diagnostics["status"] != "error":
        all_ok = all(
            check.get("status") in ["ok", "connected"]
            for check in diagnostics["checks"].values()
        )
        diagnostics["status"] = "healthy" if all_ok else "degraded"

    return diagnostics


@router.get("/debug/files/{file_id}")
async def debug_file(file_id: str, request: Request):
    """
    Check if a specific file has been indexed in Cosmos DB.
    Use this to verify file processing completed successfully.
    """
    try:
        user = get_user_from_request(request)
        user_id = user["user_id"]
        logger.info(f"AUDIT: User {user_id} accessed /debug/files/{file_id}")
    except Exception:
        pass

    try:
        # Count chunks for this file
        chunk_count = cosmos_client.collection.count_documents({"file_id": file_id})

        # Get sample chunks
        sample_chunks = list(
            cosmos_client.collection.find(
                {"file_id": file_id},
                {
                    "_id": 1,
                    "file_name": 1,
                    "chunk_index": 1,
                    "start_line": 1,
                    "user_id": 1,
                },
            ).limit(5)
        )

        return {
            "file_id": file_id,
            "indexed": chunk_count > 0,
            "chunk_count": chunk_count,
            "sample_chunks": [
                {
                    "id": str(c["_id"]),
                    "file_name": c["file_name"],
                    "chunk_index": c["chunk_index"],
                    "start_line": c["start_line"],
                    "user_id": c["user_id"],
                }
                for c in sample_chunks
            ],
            "message": (
                "File is indexed and ready for search"
                if chunk_count > 0
                else "File NOT found in vector database. Re-upload or re-process the file."
            ),
        }
    except Exception as e:
        return {"file_id": file_id, "indexed": False, "error": str(e)}
