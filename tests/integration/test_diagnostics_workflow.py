# backend/tests/integration/test_diagnostics_workflow.py
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from routes.health import debug_cosmos

@pytest.mark.asyncio
async def test_cosmos_diagnostics_logic(client):
    """Ensures the diagnostic route correctly identifies index warnings."""
    # Mock Cosmos to report a missing vector index
    with patch("routes.health.cosmos_client") as mock_cosmos:
        # Simulate a list of indexes missing 'vector' or 'cosmosSearch'
        mock_cosmos.collection.list_indexes.return_value = [{"name": "id_index"}]
        mock_cosmos.collection.estimated_document_count.return_value = 100
        mock_cosmos.get_embeddings = AsyncMock(return_value=[0.1] * 1536)
        
        # Hit the diagnostic endpoint
        response = client.get("/debug/cosmos")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify the application logic correctly flagged the 'warning' status
        assert data["checks"]["indexes"]["status"] == "warning"
        assert "Vector index may not be configured" in data["checks"]["indexes"]["warning"]
        assert data["status"] == "degraded"