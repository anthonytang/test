# backend/tests/integration/test_section_dependency_workflow.py
import pytest
from state import section_jobs
from unittest.mock import patch

@pytest.mark.asyncio
async def test_section_dependency_injection(client):
    """Ensures that results from Section A are correctly passed as context to Section B."""
    section_id = "section_B"
    dependency_data = {
        "section_id": "section_A",
        "section_name": "Introduction",
        "section_type": "text",
        "response": "This is the content of section A"
    }

    with patch("routes.sections.get_user_from_request") as mock_auth:
        mock_auth.return_value = {"user_id": "user_1", "user_email": "a@b.com"}
        
        payload = {
            "section_name": "Analysis",
            "section_description": "Analyze intro",
            "file_ids": [],
            "project_metadata": {"description": "test"},
            "template_metadata": {"description": "test"},
            "output_format": "text", # FIX: Use 'text' instead of 'markdown'
            "dependent_section_results": [dependency_data]
        }
        
        response = client.post(f"/sections/{section_id}/processing", json=payload)
        assert response.status_code == 200
        assert section_jobs[section_id]["dependent_section_results"][0]["response"] == "This is the content of section A"
        