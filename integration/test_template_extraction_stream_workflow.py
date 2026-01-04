# backend/tests/integration/test_template_extraction_stream_workflow.py
import pytest
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_document_to_template_stream_workflow(client):
    """Tests the full SSE flow for extracting a template from a file."""
    file_id = "file_123"
    token = "fake_token"

    with patch("routes.templates.extract_user_from_token") as mock_auth, \
         patch("routes.templates.storage_client", new_callable=AsyncMock) as mock_storage, \
         patch("routes.templates.TemplateExtractor") as mock_extractor_class:
        
        mock_auth.return_value = {"user_id": "u1", "user_email": "e@e.com"}
        mock_storage.get_file_info.return_value = {"user_id": "u1", "file_path": "a.pdf", "file_name": "a.pdf"}
        mock_storage.download_file.return_value = b"fake-pdf-content"
        
        mock_extractor = mock_extractor_class.return_value
        async def mock_gen(*args):
            yield {"event": "progress", "data": {"progress": 50, "message": "Parsing"}}
            yield {"event": "complete", "data": {"template": {"name": "Extracted"}}}
        
        mock_extractor.generate_template_from_document = mock_gen

        response = client.get(f"/templates/extractions/{file_id}/stream?token={token}")
        
        assert response.status_code == 200
        
        # FIX: Handle potential string/bytes mismatch in iter_lines
        events = []
        for line in response.iter_lines():
            if not line:
                continue
            event_line = line.decode('utf-8') if hasattr(line, 'decode') else line
            events.append(event_line)
        
        assert any("Parsing" in e for e in events)
        assert any("Extracted" in e for e in events)