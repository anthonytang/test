"""Azure Blob Storage and PostgreSQL client for file operations."""
import json
import asyncio
import logging
import hashlib
from typing import Optional, Dict, Any, Union
from datetime import datetime
from azure.storage.blob import BlobServiceClient
import asyncpg
from pydantic import BaseModel
from core.exceptions import StorageError, DatabaseError, ValidationError

from core.config import (
    AZURE_STORAGE_ACCOUNT_NAME,
    AZURE_STORAGE_ACCOUNT_KEY,
    AZURE_STORAGE_CONTAINER_NAME,
    PGHOST,
    PGPORT,
    PGDATABASE,
    PGUSER,
    PGPASSWORD
)

logger = logging.getLogger(__name__)


class AzureStorageClient:
    def __init__(self):
        self.account_name = AZURE_STORAGE_ACCOUNT_NAME
        self.account_key = AZURE_STORAGE_ACCOUNT_KEY
        self.container_name = AZURE_STORAGE_CONTAINER_NAME

        if not self.account_name or not self.account_key:
            raise ValidationError("AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY required")

        self.connection_string = f"DefaultEndpointsProtocol=https;AccountName={self.account_name};AccountKey={self.account_key};EndpointSuffix=core.windows.net"
        self.blob_service_client = BlobServiceClient.from_connection_string(self.connection_string)

        self.db_config = {
            "host": PGHOST,
            "port": PGPORT,
            "database": PGDATABASE,
            "user": PGUSER,
            "password": PGPASSWORD,
            "ssl": "require"
        }

        logger.info(f"[AZURE] Initialized Azure Storage client for account: {self.account_name}")

    def _serialize(self, obj: Any) -> Any:
        """Serialize Pydantic models to dicts recursively."""
        if isinstance(obj, BaseModel):
            return obj.model_dump()
        if isinstance(obj, dict):
            return {k: self._serialize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._serialize(v) for v in obj]
        return obj

    async def download_file(self, file_path: str) -> bytes:
        """Download file content from Azure Blob Storage."""
        try:
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name,
                blob=file_path
            )
            return await asyncio.to_thread(lambda: blob_client.download_blob().readall())
        except Exception as e:
            logger.error(f"Error downloading file {file_path}: {e}", exc_info=True)
            raise StorageError(f"Failed to download file from blob storage: {e}")

    async def get_file_info(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file information from database."""
        conn = None
        try:
            conn = await asyncpg.connect(**self.db_config)
            row = await conn.fetchrow("SELECT * FROM files WHERE id = $1", file_id)
            return dict(row) if row else None
        except Exception as e:
            logger.error(f"Error getting file info for {file_id}: {e}", exc_info=True)
            raise DatabaseError(f"Database query failed: {e}")
        finally:
            if conn:
                await conn.close()

    async def update_file_processing_results(
        self,
        file_id: str,
        metadata: Dict[str, Any],
        content: Dict[str, Any],
        sheets: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Update file processing results in files table.

        Args:
            file_id: File ID
            metadata: Document metadata (company, ticker, doc_type, etc.)
            content: Content map {unit_id: {text, location}} for highlighting
            sheets: Full Excel sheets when truncated (for context loading)
        """
        conn = None
        try:
            conn = await asyncpg.connect(**self.db_config)

            # Serialize Pydantic models and store sheets in metadata
            meta_dict = self._serialize(metadata)
            if sheets:
                meta_dict['sheets'] = self._serialize(sheets)

            metadata_json = json.dumps(meta_dict)
            content_json = json.dumps(self._serialize(content))

            result = await conn.fetchrow(
                """
                UPDATE files
                SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                    content = $3::jsonb
                WHERE id = $1
                RETURNING id
                """,
                file_id,
                metadata_json,
                content_json
            )

            return result is not None
        except Exception as e:
            logger.error(f"Database operation failed for file {file_id}: {e}", exc_info=True)
            raise DatabaseError(f"Failed to update database record: {e}")
        finally:
            if conn:
                await conn.close()

    async def update_processing_status(self, file_id: str, status: str) -> bool:
        """Update the processing status of a file."""
        conn = None
        try:
            conn = await asyncpg.connect(**self.db_config)
            result = await conn.fetchrow(
                "UPDATE files SET processing_status = $2 WHERE id = $1 RETURNING id",
                file_id, status
            )
            return result is not None
        except Exception as e:
            logger.error(f"Database operation failed for file {file_id}: {e}", exc_info=True)
            raise DatabaseError(f"Failed to update database record: {e}")
        finally:
            if conn:
                await conn.close()

    async def upload_file(self, file_path: str, content: bytes, metadata: Optional[Dict[str, str]] = None) -> str:
        """Upload file to Azure Blob Storage."""
        try:
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name,
                blob=file_path
            )
            await asyncio.to_thread(blob_client.upload_blob, content, overwrite=True, metadata=metadata)
            return blob_client.url
        except Exception as e:
            logger.error(f"Error uploading file {file_path}: {e}", exc_info=True)
            raise StorageError(f"Failed to upload file to blob storage: {e}")

    async def create_web_file_record(
        self,
        file_id: str,
        user_id: str,
        url: str,
        text_content: str,
        metadata: Dict[str, Any],
        content: Dict[str, Any]
    ) -> bool:
        """Create a file record for web-scraped content.

        Args:
            file_id: File ID
            user_id: User ID
            url: Source URL (used as file_name and file_path)
            text_content: Raw text content for size calculation
            metadata: Document metadata
            content: Content map {unit_id: {text, location}} for highlighting
        """
        conn = None
        try:
            conn = await asyncpg.connect(**self.db_config)
            await conn.execute(
                """
                INSERT INTO files (id, user_id, file_name, file_path, file_size, file_hash, metadata, content, processing_status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (id) DO UPDATE SET
                    metadata = EXCLUDED.metadata,
                    content = EXCLUDED.content,
                    processing_status = EXCLUDED.processing_status
                """,
                file_id,
                user_id,
                url,
                url,
                len(text_content),
                hashlib.md5(text_content.encode()).hexdigest(),
                json.dumps(self._serialize(metadata)),
                json.dumps(self._serialize(content)),
                'completed',
                datetime.now()
            )
            return True
        except Exception as e:
            logger.error(f"Error creating web file record: {e}", exc_info=True)
            raise DatabaseError(f"Failed to create web file record: {e}")
        finally:
            if conn:
                await conn.close()

    async def link_file_to_project(self, project_id: str, file_id: str, user_id: str) -> bool:
        """Link a file to a project."""
        conn = None
        try:
            conn = await asyncpg.connect(**self.db_config)
            await conn.execute(
                """
                INSERT INTO project_files (project_id, file_id, added_at, added_by)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (project_id, file_id) DO NOTHING
                """,
                project_id,
                file_id,
                datetime.now(),
                user_id
            )
            return True
        except Exception as e:
            logger.error(f"Error linking file to project: {e}", exc_info=True)
            raise DatabaseError(f"Failed to link file to project: {e}")
        finally:
            if conn:
                await conn.close()
