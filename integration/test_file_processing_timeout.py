# backend/tests/integration/test_file_processing_timeout.py
import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from routes.files import process_file_stream

@pytest.mark.asyncio
async def test_file_stream_timeout_handling(client):
    """Ensures the SSE stream emits a timeout event if processing hangs."""
    file_id = "slow_file_123"
    token = "fake_token"
    
    # Mock auth and storage
    with patch("routes.files.extract_user_from_token") as mock_auth, \
         patch("routes.files.storage_client", new_callable=AsyncMock) as mock_storage, \
         patch("routes.files.stream_file_processing") as mock_stream:
        
        mock_auth.return_value = {"user_id": "u1", "user_email": "e@e.com"}
        mock_storage.get_file_info.return_value = {"user_id": "u1", "file_name": "huge.pdf"}
        
        # Simulate a timeout by making the generator sleep longer than the timeout limit
        # For testing, we patch the timeout to be 0.1s instead of 600s
        async def slow_gen(*args):
            await asyncio.sleep(0.5)
            yield {"event": "progress"}

        mock_stream.side_effect = slow_gen
        
        # We target the actual route logic here
        with patch("routes.files.asyncio.timeout", return_value=asyncio.timeout(0.1)):
            response = await process_file_stream(file_id, MagicMock(), token)
            
            # Collect events from the stream
            events = []
            async for event in response.body_iterator:
                events.append(event)
            
            # Verify the code handled the timeout and updated status
            assert any("Processing timeout" in str(e) for e in events)
            mock_storage.update_processing_status.assert_called_with(file_id, "failed")