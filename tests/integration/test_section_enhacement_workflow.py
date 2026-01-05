# backend/tests/integration/test_section_enhancement_workflow.py
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_enhance_section_flow(client):
    """Tests refining a section description based on user feedback."""
    with patch("routes.sections.get_user_from_request") as mock_auth, \
         patch("routes.sections.conversational.refine_section_description", new_callable=AsyncMock) as mock_refine:
        
        mock_auth.return_value = {"user_id": "u1", "user_email": "e@e.com"}
        mock_refine.return_value = "This is a much better description."
        
        payload = {
            "description": "Original boring description",
            "section_name": "Strategy",
            "section_type": "text",
            "feedback": "Make it more professional"
        }
        
        # Patch request as per routes/sections.py
        response = client.patch("/sections/sec_123", json=payload)
        
        assert response.status_code == 200
        assert response.json()["data"]["enhanced_description"] == "This is a much better description."