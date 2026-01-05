# backend/tests/integration/test_cleanup_workflow.py
import pytest
from unittest.mock import AsyncMock, patch
from routes.files import delete_file

@pytest.mark.asyncio
async def test_file_deletion_logic(client):
    """Ensures that deleting a file triggers the correct database cleanup."""
    file_id = "file_to_delete"
    user_id = "user_123"

    with patch("routes.files.get_user_from_request") as mock_auth, \
         patch("routes.files.storage_client", new_callable=AsyncMock) as mock_storage, \
         patch("routes.files.cosmos_client", new_callable=AsyncMock) as mock_cosmos:
        
        mock_auth.return_value = {"user_id": user_id, "user_email": "test@test.com"}
        mock_storage.get_file_info.return_value = {"user_id": user_id}
        
        # Call the actual delete endpoint
        response = client.delete(f"/files/{file_id}")
        
        assert response.status_code == 200
        # Verify it specifically called the delete logic for the correct user's namespace
        mock_cosmos.delete_file.assert_called_once_with(file_id=file_id, namespace=user_id)