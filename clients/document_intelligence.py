"""Azure Document Intelligence client for PDF OCR processing."""

import asyncio
import logging
from typing import Any

from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential
from core.exceptions import ParsingError, ValidationError

from core.config import (
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
    AZURE_DOCUMENT_INTELLIGENCE_KEY,
    DOCUMENT_INTELLIGENCE_MODEL_ID
)

logger = logging.getLogger(__name__)


class AzureDocumentIntelligenceClient:
    """Thin wrapper around Azure Document Intelligence API."""

    def __init__(self):
        endpoint = AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
        key = AZURE_DOCUMENT_INTELLIGENCE_KEY

        if not endpoint or not key:
            raise ValidationError(
                "Missing AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT or AZURE_DOCUMENT_INTELLIGENCE_KEY"
            )

        self.client = DocumentIntelligenceClient(
            endpoint=endpoint,
            credential=AzureKeyCredential(key)
        )
        logger.info(f"Document Intelligence client initialized: {endpoint}")

    async def analyze_document(self, file_path: str) -> Any:
        """Analyze PDF using Azure Document Intelligence OCR."""
        def analyze():
            try:
                with open(file_path, "rb") as f:
                    poller = self.client.begin_analyze_document(model_id=DOCUMENT_INTELLIGENCE_MODEL_ID, body=f)
                return poller.result()
            except Exception as e:
                logger.error(f"Azure Document Intelligence analysis failed: {e}", exc_info=True)
                raise ParsingError(f"Failed to parse document via Azure AI: {e}")
        return await asyncio.to_thread(analyze)
