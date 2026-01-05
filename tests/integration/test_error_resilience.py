# backend/tests/integration/test_error_resilience.py
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from routes.files import stream_file_processing
from core.exceptions import AIError

@pytest.mark.asyncio
async def test_llm_failure_streaming():
    """If the AI parser fails mid-stream, does it yield an error event?"""
    file_id = "file_999"
    user_id = "user_123"
    
    # Mock the FastAPI request object
    mock_request = AsyncMock()
    mock_request.is_disconnected.return_value = False

    # Mock BOTH parse_document and analyze_document_metadata
    with patch("routes.files.parser.parse_document", new_callable=AsyncMock) as mock_parse, \
         patch("routes.files.parser.analyze_document_metadata", new_callable=AsyncMock) as mock_analyze, \
         patch("routes.files.storage_client", new_callable=AsyncMock) as mock_storage:
        
        # 1. Setup mock storage info
        mock_storage.get_file_info.return_value = {
            "file_path": "path/test.pdf", 
            "file_name": "test.pdf",
            "user_id": user_id
        }
        mock_storage.download_file.return_value = b"fake-content"
        
        # 2. Mock parse_document to succeed (returning dummy data)
        # This prevents hitting the real Azure network
        mock_parse.return_value = MagicMock() 
        
        # 3. Trigger the specific AI failure we want to test at the next step
        mock_analyze.side_effect = AIError("Model overloaded")
        
        events = []
        async for event in stream_file_processing(user_id, file_id, mock_request):
            events.append(event)
            
        # Verify an error event was produced
        assert any(e.get("event") == "error" for e in events)
        
        # Verify the error data contains our specific mock message
        error_data = next(e["data"] for e in events if e["event"] == "error")
        assert "Model overloaded" in error_data