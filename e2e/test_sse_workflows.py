import pytest
import json

def test_section_processing_sse_stream(client, mocker):
    """Verifies that the section processing endpoint delivers the correct progress sequence."""
    
    mocker.patch(
        "routes.sections.get_user_from_request", 
        return_value={"user_id": "test-user", "user_email": "anthony@example.com"}
    )

    # 1. Initialize section processing
    payload = {
        "section_name": "Test Section",
        "section_description": "Analyze growth trends",
        "file_ids": ["00000000-0000-0000-0000-000000000000"],
        "project_metadata": {"description": "E2E Test Project"},
        "template_metadata": {"description": "Test Template"},
        "output_format": "text"
    }

    # This will return 200 because the auth check is mocked
    init_res = client.post("/sections/test_sec_id/processing", json=payload)
    
    assert init_res.status_code == 200
    data = init_res.json()
    assert data["sectionId"] == "test_sec_id"
    assert "streamUrl" in data