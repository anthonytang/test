"""Azure Blob Storage and PostgreSQL client for file operations."""
import json
import asyncio
import logging
from typing import Optional, Dict, Any
from datetime import datetime, date
from azure.storage.blob import BlobServiceClient
import asyncpg

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


class DateTimeEncoder(json.JSONEncoder):
    """JSON encoder that handles datetime objects."""
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return super().default(obj)


class AzureStorageClient:
    def __init__(self):
        self.account_name = AZURE_STORAGE_ACCOUNT_NAME
        self.account_key = AZURE_STORAGE_ACCOUNT_KEY
        self.container_name = AZURE_STORAGE_CONTAINER_NAME

        if not self.account_name or not self.account_key:
            raise ValueError("AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY required")

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

    async def download_file(self, file_path: str) -> bytes:
        """Download file content from Azure Blob Storage."""
        try:
            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name,
                blob=file_path
            )
            return await asyncio.to_thread(lambda: blob_client.download_blob().readall())
        except Exception as e:
            logger.error(f"Error downloading file {file_path}: {e}")
            raise

    async def get_file_info(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file information from database."""
        conn = None
        try:
            conn = await asyncpg.connect(**self.db_config)
            row = await conn.fetchrow("SELECT * FROM files WHERE id = $1", file_id)
            return dict(row) if row else None
        except Exception as e:
            logger.error(f"Error getting file info for {file_id}: {e}")
            raise
        finally:
            if conn:
                await conn.close()

    async def update_file_processing_results(
        self,
        file_id: str,
        metadata: Dict[str, Any],
        file_map: Dict[int, Any],
        page_map: Dict[int, int],
        excel_file_map: Optional[Dict[str, Any]] = None,
        sheet_map: Optional[Dict[int, str]] = None,
        full_excel_sheets: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Update file processing results in files table."""
        conn = None
        try:
            conn = await asyncpg.connect(**self.db_config)

            if full_excel_sheets:
                if metadata is None:
                    metadata = {}
                metadata['full_excel_sheets'] = full_excel_sheets

            metadata_json = json.dumps(metadata, cls=DateTimeEncoder) if metadata else None
            file_map_json = json.dumps(file_map, cls=DateTimeEncoder) if file_map else None
            page_map_json = json.dumps(page_map, cls=DateTimeEncoder) if page_map else None
            excel_file_map_json = json.dumps(excel_file_map, cls=DateTimeEncoder) if excel_file_map else None
            sheet_map_json = json.dumps(sheet_map, cls=DateTimeEncoder) if sheet_map else None

            query = """
                UPDATE files
                SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                    file_map = $3::jsonb,
                    page_map = $4::jsonb,
                    excel_file_map = $5::jsonb,
                    sheet_map = $6::jsonb
                WHERE id = $1
                RETURNING id
            """

            result = await conn.fetchrow(
                query,
                file_id,
                metadata_json,
                file_map_json,
                page_map_json,
                excel_file_map_json,
                sheet_map_json
            )

            return result is not None
        except Exception as e:
            logger.error(f"[AZURE] Error updating file processing results for {file_id}: {str(e)}")
            raise
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
            logger.error(f"Error updating processing status for {file_id}: {e}")
            raise
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
            logger.error(f"Error uploading file {file_path}: {e}")
            raise

    async def create_web_file_record(
        self,
        file_id: str,
        user_id: str,
        file_name: str,
        source_url: str,
        content: str,
        metadata: Dict[str, Any],
        file_map: Dict[int, Any],
        page_map: Dict[int, int]
    ) -> bool:
        """Create a file record for web-scraped content."""
        import hashlib
        conn = None
        try:
            conn = await asyncpg.connect(**self.db_config)
            await conn.execute("""
                INSERT INTO files (id, user_id, file_name, file_path, file_size, file_hash, metadata, file_map, page_map, processing_status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO UPDATE SET
                    metadata = EXCLUDED.metadata,
                    file_map = EXCLUDED.file_map,
                    page_map = EXCLUDED.page_map,
                    processing_status = EXCLUDED.processing_status
            """,
                file_id, user_id, file_name, source_url, len(content),
                hashlib.md5(content.encode()).hexdigest(),
                json.dumps(metadata), json.dumps(file_map or {}), json.dumps(page_map or {}),
                'completed', datetime.now()
            )
            return True
        except Exception as e:
            logger.error(f"Error creating web file record: {e}")
            raise
        finally:
            if conn:
                await conn.close()

    async def link_file_to_project(self, project_id: str, file_id: str, user_id: str) -> bool:
        """Link a file to a project."""
        conn = None
        try:
            conn = await asyncpg.connect(**self.db_config)
            await conn.execute("""
                INSERT INTO project_files (project_id, file_id, added_at, added_by)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (project_id, file_id) DO NOTHING
            """, project_id, file_id, datetime.now(), user_id)
            return True
        except Exception as e:
            logger.error(f"Error linking file to project: {e}")
            raise
        finally:
            if conn:
                await conn.close()
