"""
End-to-End Tests for Studio Backend
Fully corrected for async orchestration, auth, and schema compliance.
"""

import pytest
import json
import tiktoken
from unittest.mock import patch, AsyncMock, MagicMock
from ai import Agent, OutputFormat
from core import Match, File, Meta, Unit, Location, Text, Item, Source
from pipeline.search import Search
from pipeline.context import Context
from pipeline.citations import Citations

# ==============================================================================
# Test 1: File Upload & Processing Pipeline
# ==============================================================================

@pytest.mark.asyncio
async def test_file_upload_and_processing(client, test_user_id):
    """Verifies the SSE stream processing logic in routes/files.py."""
    file_id = "test-file-123"
    token = "mock-token"

    with patch("routes.files.storage_client") as mock_storage, \
         patch("routes.files.parser") as mock_parser, \
         patch("routes.files.cosmos_client") as mock_cosmos, \
         patch("routes.files.extract_user_from_token") as mock_auth:

        mock_auth.return_value = {"user_id": test_user_id, "user_email": "test@test.com"}
        
        mock_storage.get_file_info = AsyncMock(return_value={
            "file_path": "uploads/test.pdf",
            "file_name": "test.pdf",
            "user_id": test_user_id
        })
        mock_storage.download_file = AsyncMock(return_value=b"fake content")
        mock_storage.update_processing_status = AsyncMock(return_value=True)
        mock_storage.upload_file = AsyncMock(return_value=True)
        mock_storage.update_file_processing_results = AsyncMock(return_value=True)

        mock_parser.parse_document = AsyncMock(return_value=MagicMock())
        mock_parser.get_intake_content.return_value = "Intake content"
        mock_parser.analyze_document_metadata = AsyncMock(return_value=Meta())
        mock_parser.build_chunks.return_value = MagicMock(chunks=[], content="Extracted text")
        
        mock_cosmos.batch_upsert_documents = AsyncMock(return_value=True)

        response = client.get(f"/files/{file_id}/processing/stream?token={token}")
        
        assert response.status_code == 200
        assert "Downloading" in response.text
        assert "completed" in response.text

    print(f"\n✅ Test 1 PASSED")


# ==============================================================================
# Test 2: Vector Search & Query Generation
# ==============================================================================

@pytest.mark.asyncio
async def test_vector_search_and_query_generation():
    """Verifies search query generation logic."""
    with patch("pipeline.search.get_agent") as mock_get_agent:
        mock_agent = MagicMock()
        mock_agent.plan_retrieval = AsyncMock(return_value=["query 1", "query 2"])
        mock_get_agent.return_value = mock_agent

        search = Search()
        queries = await search._generate_search_queries(
            section_name="Revenue", section_description="Desc",
            template_description="Tmpl", project_description="Proj"
        )

        assert isinstance(queries, list)
        assert len(queries) == 2
    print(f"✅ Test 2 PASSED")


# ==============================================================================
# Test 3: Context Building & Token Budget
# ==============================================================================

def test_context_building_and_token_budget():
    """Verifies context assembly and token counting."""
    context = Context()
    file = File(id="f1", name="doc.pdf")
    
    mock_chunks = [
        Match(
            id=f"c{i}", file=file, score=0.9, tokens=100,
            units=[Unit(id=f"u{i}", type="text", text="Data", location=Location(page=1))],
            meta=Meta()
        ) for i in range(5)
    ]

    context_text, sources = context.build(mock_chunks, sheets_map={})
    assert isinstance(context_text, str)
    assert len(sources) > 0
    print(f"✅ Test 3 PASSED")


# ==============================================================================
# Test 4: AI Response Generation with Citations
# ==============================================================================

@pytest.mark.asyncio
async def test_ai_response_generation_with_citations():
    """Verifies AI response generation through the Agent."""
    with patch("ai.agent.get_azure_client") as mock_get_azure:
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(
            return_value=MagicMock(choices=[MagicMock(message=MagicMock(content="Revenue was $100M [1]."))])
        )
        mock_get_azure.return_value = mock_client

        agent = Agent()
        response = await agent.generate_response(
            context="1. Revenue data",
            dependent_sections_context="", 
            section_name="Rev", section_description="D",
            template_description="T", project_description="P",
            output_format=OutputFormat.TEXT
        )
        assert "Revenue was $100M" in str(response)
    print(f"✅ Test 4 PASSED")


# ==============================================================================
# Test 5: Citation Scoring & Mapping
# ==============================================================================

@pytest.mark.asyncio
async def test_citation_scoring_and_mapping():
    """Verifies citation extraction and similarity scoring."""
    citations_processor = Citations()
    mock_unit = Unit(id="u2", type="text", text="Source text", location=Location(page=1))
    sources = {"2": Source(unit=mock_unit, file=File(id="f1", name="q.pdf"), meta=Meta())}
    response_obj = Text(items=[Item(text="Response claim", tags=["2"])])

    with patch("pipeline.citations.Similarity.compute_similarity_scores") as mock_sim, \
         patch("pipeline.citations.get_cosmos_client") as mock_cos:
        mock_sim.return_value = [0.95]
        mock_cos.return_value.get_embeddings = AsyncMock(return_value=[[0.1]*1536, [0.1]*1536])

        citations = await citations_processor.score_response(response=response_obj, sources=sources)
        assert isinstance(citations, dict)
        assert "c0_0" in citations
    print(f"✅ Test 5 PASSED")


# ==============================================================================
# Test 6: Complete Section Processing Pipeline
# ==============================================================================

@pytest.mark.asyncio
async def test_complete_section_processing_pipeline(client, test_user_id):
    """
    Verifies full section orchestration in routes/sections.py.
    Fix: Added patch for extract_user_from_token to prevent 401 on stream request.
    """
    section_id = "sec-789"
    valid_uuid = "550e8400-e29b-41d4-a716-446655440000"
    payload = {
        "section_name": "Risk",
        "section_description": "Analyze",
        "file_ids": [valid_uuid],
        "template_metadata": {"description": "Tmpl"},
        "project_metadata": {"description": "Proj"},
        "output_format": "text",
        "dependent_section_results": []
    }

    # Patch both auth functions and the pipeline task
    with patch("routes.sections.get_user_from_request") as mock_auth, \
         patch("routes.sections.extract_user_from_token") as mock_stream_auth, \
         patch("routes.sections.pipeline.run_with_progress", new_callable=AsyncMock) as mock_run:
        
        mock_auth.return_value = {"user_id": test_user_id, "user_email": "test@test.com"}
        mock_stream_auth.return_value = {"user_id": test_user_id, "user_email": "test@test.com"}
        mock_run.return_value = MagicMock(model_dump=lambda: {"answer": "Done"})
        
        # 1. Initialize processing session
        init_res = client.post(f"/sections/{section_id}/processing", json=payload)
        assert init_res.status_code == 200
        
        # 2. Access processing stream
        stream_res = client.get(f"/sections/{section_id}/processing/stream?token=mock")
        assert stream_res.status_code == 200
        assert "completed" in stream_res.text
    print(f"✅ Test 6 PASSED")


# ==============================================================================
# Test 7: Web Crawl & URL Processing
# ==============================================================================

@pytest.mark.asyncio
async def test_web_crawl_and_url_processing(client, test_user_id):
    """Verifies web crawling and indexing."""
    payload = {"project_id": "proj-123", "urls": ["https://example.com"]}

    with patch("routes.web.get_user_from_request") as mock_auth, \
         patch("routes.web.external") as mock_external:
        
        mock_auth.return_value = {"user_id": test_user_id, "user_email": "test@test.com"}
        mock_external.batch_scrape.return_value = [{
            "url": "https://example.com", "status": "success", "markdown": "# Hi",
            "title": "Ex", "description": "D", "language": "en"
        }]
        mock_external.process_scraped_content = AsyncMock(return_value={"status": "success", "url": "..."})

        response = client.post("/web/crawl", json=payload)
        assert response.status_code == 200
        assert response.json()["urls_completed"] == 1
    print(f"✅ Test 7 PASSED")