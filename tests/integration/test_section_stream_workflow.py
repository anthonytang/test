# backend/tests/integration/test_section_stream_workflow.py
import pytest
import asyncio
from unittest.mock import AsyncMock, patch
from core import Outcome, Text, Analysis

@pytest.mark.asyncio
async def test_section_rag_stream_success(client):
    """Verifies that the RAG pipeline correctly streams progress to the client."""
    section_id = "sec_123"
    token = "fake_token"
    
    # 1. Full mock job data required by stream_section_processing logic
    mock_job_data = {
        "processing_id": "p1",
        "user_id": "u1",
        "user_email": "e@e.com",
        "section_name": "Test",
        "file_ids": [],
        "section_description": "...",
        "template_description": "...",
        "project_description": "...",
        "output_format": "text",
        "cancelled": False,
        "timestamp": 0
    }
    
    mock_outcome = Outcome(
        response=Text(type="text", items=[]),
        citations={},
        analysis=Analysis(score=100, summary="Good", queries=[])
    )

    # FIX: Patch the instance 'pipeline', not the class 'Pipeline'
    with patch("routes.sections.extract_user_from_token") as mock_auth, \
         patch("routes.sections.pipeline") as mock_pipeline, \
         patch.dict("routes.sections.section_jobs", {section_id: mock_job_data}):
        
        mock_auth.return_value = {"user_id": "u1", "user_email": "e@e.com"}
        
        async def mock_run(*args, **kwargs):
            callback = kwargs.get("progress_callback")
            if callback:
                await callback({"stage": "planning", "progress": 10, "message": "Planning"})
            # Yield control to allow the SSE loop to process the event
            await asyncio.sleep(0.01)
            return mock_outcome

        mock_pipeline.run_with_progress = AsyncMock(side_effect=mock_run)

        response = client.get(f"/sections/{section_id}/processing/stream?token={token}")
        
        assert response.status_code == 200
        content = response.content.decode('utf-8')
        
        # Verify the presence of both sequential events
        assert "event: progress" in content
        assert "Planning" in content
        assert "event: completed" in content