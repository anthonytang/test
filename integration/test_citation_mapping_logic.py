# backend/tests/integration/test_citation_mapping_logic.py
import pytest
from pipeline.citations import Citations

def test_citation_expansion_and_grouping_logic():
    """Verify logic for handling complex AI citation tags."""
    cite_logic = Citations()
    
    # 1. Test Range Expansion Logic
    assert cite_logic._expand_tag_range("45-47") == ["45", "46", "47"]
    assert cite_logic._expand_tag_range("single") == ["single"]
    
    # 2. Test Sequential Grouping Logic
    # Scenario: AI cites sources 1, 2, 3 (one point) and 5 (another point)
    tags = ["1", "2", "3", "5"]
    groups = cite_logic._group_sequential(tags)
    
    assert len(groups) == 2
    assert groups[0] == ["1", "2", "3"]
    assert groups[1] == ["5"]