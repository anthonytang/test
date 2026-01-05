# backend/tests/integration/test_stream_cleanup_workflow.py
import pytest
import os
from unittest.mock import AsyncMock, patch, MagicMock
from routes.files import stream_file_processing

@pytest.mark.asyncio
async def test_temp_file_deletion_on_disconnect():
    file_id = "f1"
    user_id = "u1"
    mock_req = AsyncMock()
    # Trigger return on second check (after first yield)
    mock_req.is_disconnected.side_effect = [False, True] 

    with patch("routes.files.storage_client", new_callable=AsyncMock) as mock_storage, \
         patch("routes.files.tempfile.NamedTemporaryFile") as mock_temp, \
         patch("routes.files.os.path.exists", return_value=True), \
         patch("routes.files.os.unlink") as mock_unlink: # FIX: Patch os.unlink
        
        mock_f = MagicMock()
        mock_f.name = "/tmp/fake_test_file.pdf"
        mock_temp.return_value.__enter__.return_value = mock_f
        
        mock_storage.get_file_info.return_value = {"file_path": "a.pdf", "file_name": "a.pdf", "user_id": user_id}
        mock_storage.download_file.return_value = b"bytes"

        # Iterate generator to trigger the disconnect logic and finally block
        async for _ in stream_file_processing(user_id, file_id, mock_req):
            pass
            
        assert mock_unlink.called