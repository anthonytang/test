# backend/tests/integration/test_template_extraction_logic.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from extraction import TemplateExtractor
from core.exceptions import AIError

@pytest.mark.asyncio
async def test_generate_template_from_document_workflow():
    """Tests the full extraction pipeline logic from file path to yielded events."""
    extractor = TemplateExtractor()
    file_path = "test.docx"
    
    # Mock the internal steps to isolate CODE logic from actual AI/Network behavior
    with patch("extraction.get_gotenberg_client") as mock_gotenberg, \
         patch.object(extractor, "parser", new_callable=AsyncMock) as mock_parser, \
         patch.object(extractor, "_analyze_document_structure", new_callable=AsyncMock) as mock_struct, \
         patch.object(extractor, "_convert_structure_to_template", new_callable=AsyncMock) as mock_template:
        
        # Setup mocks
        mock_gotenberg.return_value.convert_to_pdf = AsyncMock(return_value=b"pdf_bytes")
        mock_parser.parse_document.return_value = {"blocks": []}
        mock_parser.get_full_text.return_value = "extracted text content"
        mock_struct.return_value = {"sections": ["summary"]}
        mock_template.return_value = {"template_name": "New Template"}

        events = []
        async for event in extractor.generate_template_from_document(file_path):
            events.append(event)

        # Verify the CODE correctly sequenced the workflow events
        assert events[0]["data"]["message"] == "Converting"
        assert events[1]["data"]["message"] == "Parsing"
        assert events[2]["data"]["message"] == "Analyzing"
        assert events[-1]["event"] == "complete"
        assert events[-1]["data"]["template"]["template_name"] == "New Template"