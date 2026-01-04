# backend/tests/integration/test_export_workflow.py
import pytest
from unittest.mock import patch

@pytest.mark.asyncio
async def test_chart_excel_export(client):
    """Verifies the application logic for generating a native Excel chart."""
    payload = {
        "section_id": "sec_1",
        "section_name": "Revenue Chart",
        "chart_type": "bar",
        "table_data": {
            "rows": [
                {"cells": [{"text": "Month"}, {"text": "Value"}]},
                {"cells": [{"text": "Jan"}, {"text": "100"}]}
            ]
        },
        "chart_config": {"xAxis": "Month", "yAxes": ["Value"]},
        "advanced_settings": {"colorScheme": "default"}
    }

    with patch("routes.exports.get_user_from_request") as mock_auth:
        mock_auth.return_value = {"user_id": "u1", "user_email": "e@e.com"}
        
        response = client.post("/exports/charts", json=payload)
        
        # Check that we got a valid streaming response
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        # Check that the filename contains our section ID as per routes/exports.py
        assert "chart-sec_1" in response.headers["content-disposition"]
        # Ensure the body isn't empty
        assert len(response.content) > 0