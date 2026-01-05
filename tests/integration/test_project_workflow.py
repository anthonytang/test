# backend/tests/integration/test_project_workflow.py
import pytest
from unittest.mock import AsyncMock, patch
from schemas import ProjectCreateRequest

@pytest.mark.asyncio
async def test_create_project_full_flow(client):
    """Tests the workflow of parsing a natural language prompt into a project."""
    # 1. Setup mock AI response
    mock_project_data = {
        "name": "Test Project",
        "description": "A test project",
        "metadata": {"industry": "Tech"}
    }
    
    # 2. Mock auth and AI parser
    with patch("routes.projects.get_user_from_request") as mock_auth, \
         patch("routes.projects.conversational.parse_project_request", new_callable=AsyncMock) as mock_parse:
        
        mock_auth.return_value = {"user_id": "user_123", "user_email": "test@test.com"}
        mock_parse.return_value = mock_project_data
        
        # 3. Hit the actual API endpoint
        response = client.post(
            "/projects",
            json={"description": "I want to build a tech project"}
        )
        
        # 4. Verify the application "glue" worked
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["data"]["name"] == "Test Project"
        # Verify metadata was correctly stamped by build_response in auth.py
        assert data["metadata"]["user_id"] == "user_123"