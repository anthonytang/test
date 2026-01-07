"""Azure and database client integrations with singleton pattern."""

from .openai import get_azure_client
from .cosmos import CosmosVectorClient
from .storage import AzureStorageClient
from .document_intelligence import AzureDocumentIntelligenceClient
from .gotenberg import GotenbergClient

# Singleton instances
_cosmos_client = None
_storage_client = None
_doc_intel_client = None
_gotenberg_client = None


def get_cosmos_client() -> CosmosVectorClient:
    """Get singleton Cosmos Vector client."""
    global _cosmos_client
    if _cosmos_client is None:
        _cosmos_client = CosmosVectorClient()
    return _cosmos_client


def get_storage_client() -> AzureStorageClient:
    """Get singleton Azure Storage client."""
    global _storage_client
    if _storage_client is None:
        _storage_client = AzureStorageClient()
    return _storage_client


def get_doc_intel_client() -> AzureDocumentIntelligenceClient:
    """Get singleton Document Intelligence client."""
    global _doc_intel_client
    if _doc_intel_client is None:
        _doc_intel_client = AzureDocumentIntelligenceClient()
    return _doc_intel_client


def get_gotenberg_client() -> GotenbergClient:
    """Get singleton Gotenberg client."""
    global _gotenberg_client
    if _gotenberg_client is None:
        _gotenberg_client = GotenbergClient()
    return _gotenberg_client
