# backend/tests/integration/test_evaluation_workflow.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from ai import OutputFormat

@pytest.mark.asyncio
async def test_evaluation_orchestration_logic(client):
    """Tests the logic of building evaluation prompts and handling model constraints."""
    payload = {
        "context": "Numbered context",
        "section_name": "Test Sec",
        "section_description": "Desc",
        "template_description": "Temp",
        "project_description": "Proj",
        "output_format": "text",
        "output": "Actual AI Response",
        "requirements": ["Must be concise"],
        "model_name": "gpt-4o"
    }

    with patch("routes.eval_kit.create_azure_client") as mock_client_factory, \
         patch("routes.eval_kit.build_template_prompt_with_format") as mock_build_prompt:
        
        mock_build_prompt.return_value = "Constructed Generator Prompt"
        mock_client = mock_client_factory.return_value
        
        # Mocking chat completions to match the OpenAI SDK structure
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="Evaluation Feedback"))]
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        # FIX: Path corrected to /tester/evaluate as per server.py inclusion
        response = client.post("/tester/evaluate", json=payload)
        
        assert response.status_code == 200
        assert response.json()["feedback"] == "Evaluation Feedback"
        
        # Verify model constraints (temperature logic in eval_kit.py)
        args, kwargs = mock_client.chat.completions.create.call_args
        assert kwargs["temperature"] == 0.3