# backend/tests/integration/test_web_scraping_handoff.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from external import External

@pytest.mark.asyncio
async def test_web_content_project_linking():
    """Verifies deterministic ID generation and project association logic."""
    ext = External()
    project_id = "00000000-0000-0000-0000-000000000000"
    url = "https://docs.whyai.com/intro"
    
    # 1. Generate ID twice to ensure stability (uuid5 logic)
    id1 = ext._make_file_id(project_id, url)
    id2 = ext._make_file_id(project_id, url)
    assert id1 == id2
    
    # 2. Test the full storage handoff logic in process_scraped_content
    scraped = {
        "url": url, "status": "success", "markdown": "# Hello",
        "title": "Title", "description": "Desc", "language": "en"
    }
    
    with patch.object(ext, "storage", new_callable=AsyncMock) as mock_storage, \
         patch.object(ext, "cosmos_client", new_callable=AsyncMock) as mock_cosmos, \
         patch.object(ext, "parser") as mock_parser:
        
        mock_parser.build_chunks.return_value = MagicMock(chunks=[], content="...")
        mock_parser.parse_document = AsyncMock(return_value={})

        await ext.process_scraped_content(scraped, project_id, "user_1")
        
        # Verify the code correctly linked the new file ID to the project
        mock_storage.create_web_file_record.assert_called_once()
        mock_storage.link_file_to_project.assert_called_once_with(project_id, id1, "user_1")