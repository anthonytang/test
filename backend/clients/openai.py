"""Azure OpenAI client singleton factory."""

from openai import AsyncAzureOpenAI
from core.config import (
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_ENDPOINT
)

# Cache client as module-level variable
_azure_client = None


def get_azure_client():
    """Get cached Azure OpenAI client instance (singleton pattern)"""
    global _azure_client
    if _azure_client is None:
        _azure_client = AsyncAzureOpenAI(
            api_key=AZURE_OPENAI_API_KEY,
            api_version=AZURE_OPENAI_API_VERSION,
            azure_endpoint=AZURE_OPENAI_ENDPOINT
        )
    return _azure_client


def create_azure_client(api_key=None, api_version=None, endpoint=None):
    """
    Create a new Azure OpenAI client instance (non-singleton).
    Useful for testing with different configurations or models.
    """
    return AsyncAzureOpenAI(
        api_key=api_key or AZURE_OPENAI_API_KEY,
        api_version=api_version or AZURE_OPENAI_API_VERSION,
        azure_endpoint=endpoint or AZURE_OPENAI_ENDPOINT
    )
