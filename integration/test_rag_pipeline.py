import pytest
from pipeline.main import Pipeline
from ai import OutputFormat
# Import real models to pass Pydantic validation
from core import File, Meta, Unit, Location, Match

@pytest.mark.asyncio
async def test_full_rag_pipeline_flow(mocker):
    """Validates the handoff from query planning to context building and citation scoring."""
    pipeline = Pipeline()

    # 1. Create REAL Pydantic instances instead of mocks to pass validation
    file_obj = File(id="f1", name="doc.pdf")
    
    meta_obj = Meta(
        company="Test", 
        ticker="T", 
        doc_type="10-K", 
        period_label="Q1", 
        blurb="test"
    )
    
    location_obj = Location(page=1)
    
    unit_obj = Unit(
        id="unit_1", 
        type="text", 
        text="Revenue was $5M", 
        location=location_obj
    )

    # 2. Create a real Match object (inherits from Chunk)
    match_obj = Match(
        id="chunk_1",
        score=0.9,
        file=file_obj,
        units=[unit_obj],
        tokens=100,
        meta=meta_obj,
        slice=None
    )

    # 3. Patch the search methods to return our real Match object
    mocker.patch(
        "pipeline.search.Search._execute_search_queries", 
        return_value=[match_obj]
    )
    mocker.patch(
        "pipeline.search.Search._generate_search_queries", 
        return_value=["query 1"]
    )

    # 4. Mock the AI response to include a citation tag [1]
    mocker.patch(
        "ai.agent.Agent.generate_response", 
        return_value="Revenue was $5M [1]."
    )

    # Execute the RAG pipeline
    outcome = await pipeline.run_with_progress(
        section_id="sec_1",
        file_ids=["f1"],
        section_name="Revenue",
        section_description="Extract quarterly revenue",
        template_description="Financial Report",
        project_description="Q1 Audit",
        output_format=OutputFormat.TEXT
    )

    # Verify pipeline handoffs
    assert outcome.response.type == "text"
    
    assert any(tag.startswith("c") for item in outcome.response.items for tag in item.tags)