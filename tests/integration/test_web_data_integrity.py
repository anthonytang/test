# backend/tests/integration/test_web_data_integrity.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from external import External
from core.exceptions import DatabaseError

@pytest.mark.asyncio
async def test_process_scraped_content_failure_cleanup():
    ext_client = External()
    scraped_content = {"url": "https://example.com", "status": "success", "markdown": "# T", "title": "T", "description": "D", "language": "en"}

    with patch.object(ext_client, "cosmos_client", new_callable=AsyncMock) as mock_cosmos, \
         patch.object(ext_client, "storage", new_callable=AsyncMock) as mock_storage, \
         patch.object(ext_client, "parser") as mock_parser: # FIX: Removed AsyncMock from parser
        
        # Manually assign AsyncMock only to async methods
        mock_parser.parse_document = AsyncMock(return_value={"blocks": []})
        # build_chunks is synchronous in external.py
        mock_parser.build_chunks.return_value = MagicMock(chunks=[], content="...")
        
        mock_storage.create_web_file_record.side_effect = Exception("DB Fail")
        
        with pytest.raises(DatabaseError):
            await ext_client.process_scraped_content(scraped_content, "p1", "u1")
            
        mock_cosmos.delete_file.assert_called_once()