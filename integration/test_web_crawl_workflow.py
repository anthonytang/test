# backend/tests/integration/test_web_crawl_workflow.py
import pytest
from unittest.mock import patch, AsyncMock

@pytest.mark.asyncio
async def test_web_crawl_batch_logic(client):
    """Tests the batch scraping and semaphore handling in the web crawl route."""
    payload = {
        "project_id": "proj_1",
        "urls": ["http://test1.com", "http://test2.com"]
    }

    with patch("routes.web.get_user_from_request") as mock_auth, \
         patch("routes.web.external.batch_scrape") as mock_scrape, \
         patch("routes.web.external.process_scraped_content", new_callable=AsyncMock) as mock_process:
        
        mock_auth.return_value = {"user_id": "u1", "user_email": "a@b.com"}
        mock_scrape.return_value = [{"url": "u1"}, {"url": "u2"}]
        mock_process.return_value = {"status": "success"}

        response = client.post("/web/crawl", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        assert data["urls_total"] == 2
        assert data["urls_completed"] == 2
        # Verify it actually called the processing logic for each URL
        assert mock_process.call_count == 2