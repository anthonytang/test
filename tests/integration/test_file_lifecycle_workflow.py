# backend/tests/integration/test_file_lifecycle_workflow.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from routes.files import stream_file_processing

@pytest.mark.asyncio
async def test_file_status_lifecycle_updates():
    """Verifies that the app correctly updates storage status at each phase."""
    file_id = "f1"
    user_id = "u1"
    mock_req = AsyncMock()
    mock_req.is_disconnected.return_value = False

    # Use a regular mock for parser so we can control which methods are async
    with patch("routes.files.storage_client", new_callable=AsyncMock) as mock_storage, \
         patch("routes.files.parser") as mock_parser, \
         patch("routes.files.cosmos_client", new_callable=AsyncMock) as mock_cosmos, \
         patch("routes.files.get_gotenberg_client"):
        
        # 1. Setup Parser: Async methods must be AsyncMocks, Sync methods regular Mocks
        mock_parser.parse_document = AsyncMock(return_value=MagicMock())
        mock_parser.analyze_document_metadata = AsyncMock(return_value=MagicMock())
        
        # This is a sync call in routes/files.py, so it must return the object directly
        mock_parser.build_chunks.return_value = MagicMock(content="content", chunks=[])
        mock_parser.get_intake_content.return_value = "intake content"

        # 2. Setup Storage Mocks
        mock_storage.get_file_info.return_value = {
            "file_path": "a.pdf", 
            "file_name": "a.pdf", 
            "user_id": user_id
        }
        mock_storage.download_file.return_value = b"bytes"
        mock_storage.update_file_processing_results.return_value = True
        
        # 3. Setup Cosmos Mock
        mock_cosmos.batch_upsert_documents.return_value = True

        # Run the generator
        events = []
        async for event in stream_file_processing(user_id, file_id, mock_req):
            events.append(event)

        # 4. Verify the application logic called status updates in the correct order
        status_calls = [call.args for call in mock_storage.update_processing_status.call_args_list]
        
        assert status_calls[0] == (file_id, "processing")
        assert status_calls[-1] == (file_id, "completed")
        assert any(e["event"] == "completed" for e in events)