# backend/tests/integration/test_api_contract_workflow.py
import pytest
from unittest.mock import patch, AsyncMock

def test_api_standard_response_format(client):
    # Health check is healthy but doesn't use standard envelope
    health_resp = client.get("/health")
    assert health_resp.json()["status"] == "healthy"
    
    # Check standard routed endpoint for envelope
    with patch("routes.projects.get_user_from_request") as mock_auth, \
         patch("routes.projects.conversational.parse_project_request", new_callable=AsyncMock) as mock_parse:
        mock_auth.return_value = {"user_id": "u1", "user_email": "e@e.com"}
        mock_parse.return_value = {"name": "Test"}
        
        resp = client.post("/projects", json={"description": "test"})
        data = resp.json()
        assert data["success"] is True