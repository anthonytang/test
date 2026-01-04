import pytest
from pathlib import Path
from pipeline.convert import Parser
from core import File

@pytest.mark.asyncio
async def test_pdf_ingestion_to_chunks_workflow(mocker):
    """Tests the handoff from PDF parsing to chunk building and metadata analysis."""
    parser = Parser()
    
    # Use a sample PDF from your eval_kit for testing
    test_pdf = Path(__file__).parent.parent.parent / "eval_kit/sample_data/studio_ai.pdf"
    
    # Mock AI metadata extraction to avoid external API calls and costs
    mocker.patch("pipeline.convert.Parser.analyze_document_metadata", return_value={
        "company": "TestCorp", 
        "ticker": "TSTR", 
        "doc_type": "10-K"
    })

    # 1. Test Parsing handoff: Ensure document is readable
    data = await parser.parse_document(str(test_pdf))
    assert len(data) > 0
    assert "page" in data[0]

    # 2. Test Chunk Building handoff: Ensure chunks respect token limits
    file_ref = File(id="test-id", name="studio_ai.pdf")
    parse_result = parser.build_chunks(data, file_ref)
    
    assert len(parse_result.chunks) > 0
    # Verify chunks respect PARSE_MAX_TOKENS (1024) configuration
    assert all(c.tokens <= 1024 for c in parse_result.chunks)
    # Verify unit mapping exists for citation resolution
    assert "1" in parse_result.content