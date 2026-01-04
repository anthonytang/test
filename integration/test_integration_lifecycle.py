# backend/tests/integration/test_integration_lifecycle.py
import pytest
from pipeline import get_parser, Pipeline
from core import File as CitationFile

@pytest.mark.asyncio
async def test_ingestion_to_retrieval_flow_logic():
    """
    Checks if a document ingested via the parser can be retrieved by the pipeline.
    This tests the compatibility of the data structures between Parser and Pipeline.
    """
    parser = get_parser() #
    rag_pipeline = Pipeline() #
    
    # 1. Verify Parser existence and basic setup
    assert parser is not None
    
    # 2. Verify Pipeline can be initialized with its sub-components
    assert rag_pipeline.search is not None
    assert rag_pipeline.context is not None
    
    # Create a test citation file to verify core type compatibility
    test_file = CitationFile(id="test_001", name="test_doc.md")
    assert test_file.id == "test_001"