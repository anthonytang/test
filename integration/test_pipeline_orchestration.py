# backend/tests/integration/test_pipeline_orchestration.py
import pytest
from unittest.mock import AsyncMock, patch
from pipeline.main import Pipeline
from core import Outcome, Match, File, Meta, Text, Analysis, Citation

@pytest.mark.asyncio
async def test_pipeline_outcome_assembly():
    pipe = Pipeline()
    
    # Required fields for Match (inherits from Chunk)
    sample_match = Match(
        id="m1",
        file=File(id="f1", name="doc.pdf"),
        units=[],
        tokens=0,
        score=0.9,
        meta=Meta()
    )

    with patch.object(pipe.search, "_generate_search_queries", new_callable=AsyncMock) as mock_q, \
         patch.object(pipe.search, "_execute_search_queries", new_callable=AsyncMock) as mock_e, \
         patch.object(pipe, "_generate_ai_response", new_callable=AsyncMock) as mock_ai, \
         patch.object(pipe.citations, "score_response", new_callable=AsyncMock) as mock_score, \
         patch.object(pipe.agent, "analyze", new_callable=AsyncMock) as mock_analyze:
        
        mock_q.return_value = ["query"]
        mock_e.return_value = [sample_match]
        
        # FIX: Satisfy Pydantic Outcome validation
        mock_ai.return_value = Text(type="text", items=[]) 
        mock_score.return_value = {"1": Citation(units=[], file=File(id="f1", name="n"), score=1.0)}
        mock_analyze.return_value = Analysis(
            score=90, # Must be an integer
            summary="Valid summary", 
            queries=["q1"]
        )

        result = await pipe.run_with_progress(
            section_id="sec_1", file_ids=["f1"], section_name="Test",
            section_description="...", template_description="...",
            project_description="...", output_format="text"
        )
        
        assert isinstance(result, Outcome)
        assert result.analysis.score == 90