# backend/tests/integration/test_template_workflow.py
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_generate_template_flow(client):
    """Tests the logic of generating a template from a description."""
    mock_template = {
        "template": {"name": "Audit Report"},
        "sections": [{"name": "Summary", "description": "General summary"}]
    }

    with patch("routes.templates.get_user_from_request") as mock_auth, \
         patch("routes.templates.conversational.parse_template_request", new_callable=AsyncMock) as mock_parse:
        
        mock_auth.return_value = {"user_id": "u1", "user_email": "test@test.com"}
        mock_parse.return_value = mock_template
        
        payload = {
            "description": "I need a standard audit report template",
            "project_name": "My Project",
            "project_description": "p-desc",
            "project_metadata": {}
        }
        
        response = client.post("/templates", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["template"]["name"] == "Audit Report"
        assert len(data["data"]["sections"]) == 1