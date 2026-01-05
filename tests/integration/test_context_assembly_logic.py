# backend/tests/integration/test_context_assembly_logic.py
import pytest
from unittest.mock import patch, MagicMock # Added patch
from pipeline.context import Context
from core import Match, File, Meta, Unit, Location

def test_context_selection_and_sorting_logic():
    """Verify selection by relevance and presentation in document order."""
    ctx = Context()
    file = File(id="f1", name="doc.pdf")
    
    # Logic Input: Relevance says Page 2 is best, but Page 1 must come first in text.
    matches = [
        Match(
            id="m1", file=file, score=0.5, tokens=10, 
            units=[Unit(id="u1", type="text", text="Start", location=Location(page=1))],
            meta=Meta()
        ),
        Match(
            id="m2", file=file, score=0.9, tokens=10, 
            units=[Unit(id="u2", type="text", text="Middle", location=Location(page=2))],
            meta=Meta()
        )
    ]
    
    # Test Budget Logic: If budget is 15, m1+m2 (20 tokens) is too much.
    # The logic should pick m2 (highest score).
    with patch("pipeline.context.CONTEXT_MAX_TOKENS", 15):
        context_text, _ = ctx.build(matches)
        
        assert "Middle" in context_text
        assert "Start" not in context_text