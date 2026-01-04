# backend/tests/integration/test_template_cancellation_workflow.py
import pytest
from state import extraction_jobs
from unittest.mock import patch, AsyncMock

@pytest.mark.asyncio
async def test_template_extraction_abort_logic(client):
    """Ensures that marking an extraction as cancelled stops the SSE stream."""
    file_id = "f1"
    user_id = "u1"
    # Replicate the ID generation logic from routes/templates.py
    # We'll patch datetime to make the ID predictable
    with patch("routes.templates.datetime") as mock_date:
        mock_date.now.return_value.isoformat.return_value = "2024-01-01"
        gen_id = f"{user_id}_{file_id}_2024-01-01"
        
        # 1. Initialize the job state
        extraction_jobs[gen_id] = {"cancelled": False}
        
        # 2. Call the abort endpoint
        with patch("routes.templates.get_user_from_request") as mock_auth:
            mock_auth.return_value = {"user_id": user_id, "user_email": "e@e.com"}
            
            # The abort logic searches keys starting with user_id_file_id_
            response = client.delete(f"/templates/extractions/{file_id}")
            
            assert response.status_code == 200
            assert extraction_jobs[gen_id]["cancelled"] is True
            assert "Template extraction cancelled" in response.json()["message"]

@pytest.mark.asyncio
async def test_template_stream_respects_cancellation():
    """Verifies the SSE generator yields a 'cancelled' event if state is flipped."""
    from routes.templates import stream_template_extraction
    
    file_id = "f1"
    token = "fake"
    
    with patch("routes.templates.extract_user_from_token") as mock_auth, \
         patch("routes.templates.extraction_jobs") as mock_jobs:
        
        mock_auth.return_value = {"user_id": "u1", "user_email": "e@e.com"}
        # Simulate a job that is ALREADY cancelled
        mock_jobs.get.return_value = {"cancelled": True}
        
        response = await stream_template_extraction(file_id, AsyncMock(), token)
        
        events = []
        async for event in response.body_iterator:
            events.append(event)
            
        # Verify the CODE correctly caught the state change
        assert events[0]["event"] == "cancelled"