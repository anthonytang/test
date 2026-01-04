# backend/tests/integration/test_excel_recovery_logic.py
import pytest
from pipeline.context import Context
from core import Match, File, Sheet, Dimensions, Cell, Slice, Meta # Added Meta

def test_truncated_table_expansion_logic():
    """Verify that truncated table chunks are repaired with full sheets."""
    ctx = Context()
    file_id = "excel_1"
    sheet_name = "Sheet1"
    
    # 1. Create a match marked as 'truncated'
    # This triggers the 'if match.slice and match.slice.truncated' logic
    match = Match(
        id="m1", file=File(id=file_id, name="a.xlsx"), score=1.0, tokens=5,
        units=[], slice=Slice(sheet=sheet_name, truncated=True), meta=Meta()
    )
    
    # 2. Mock the full sheet data
    full_sheet = Sheet(
        cells={"A1": Cell(value="Full Table Content", row=1, col="A")},
        dimensions=Dimensions(max_row=1, max_col=1),
        tokens=100
    )
    sheets_map = {file_id: {sheet_name: full_sheet}}
    
    # 3. build() should now skip the empty units and reconstruct from sheets_map
    context_text, _ = ctx.build([match], sheets_map=sheets_map)
    
    assert "Full Table Content" in context_text