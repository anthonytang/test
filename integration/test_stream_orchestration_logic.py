# backend/tests/integration/test_stream_orchestration_logic.py
import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from routes.sections import stream_section_processing

@pytest.mark.asyncio
async def test_sse_orchestration_loop_logic():
    """Verify coordination of progress events and final results in the SSE loop."""
    section_id = "sec_1"
    # The processing_id MUST match between the request and the global state
    request_data = {
        "processing_id": "session_123", 
        "user_id": "u1", 
        "user_email": "e@e.com", 
        "section_name": "Test",
        "file_ids": [], 
        "section_description": "d", 
        "template_description": "t", 
        "project_description": "p", 
        "output_format": "text", 
        "cancelled": False
    }
    
    mock_request = AsyncMock()
    mock_request.is_disconnected.return_value = False

    # Patch the pipeline instance and the global state dictionary
    with patch("routes.sections.pipeline") as mock_pipeline, \
         patch.dict("routes.sections.section_jobs", {section_id: {"processing_id": "session_123"}}):
        
        async def mock_run_logic(**kwargs):
            callback = kwargs.get("progress_callback")
            if callback:
                # 1. Yield a progress event
                await callback({"stage": "testing", "progress": 50})
            
            # Allow the queue to process
            await asyncio.sleep(0.01)
            
            # 2. Return a mock Outcome (must have model_dump for serialization)
            mock_outcome = MagicMock()
            mock_outcome.model_dump.return_value = {"answer": "done"}
            return mock_outcome

        mock_pipeline.run_with_progress = AsyncMock(side_effect=mock_run_logic)

        events = []
        async for event in stream_section_processing(section_id, request_data, mock_request):
            events.append(event)
            
        # Verify order: progress event first, then completed event
        assert events[0]["event"] == "progress"
        assert events[-1]["event"] == "completed"
        assert "done" in str(events[-1]["data"])