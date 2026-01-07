"""Custom exception classes"""

class StudioError(Exception):
    """Base exception for all Studio related errors."""
    def __init__(self, message: str, details: dict = {}):
        super().__init__(message)
        self.message = message
        self.details = details

class ValidationError(StudioError):
    """Raised when input validation fails (missing fields, empty strings)."""
    pass

class AuthenticationError(StudioError):
    """Raised when JWT decoding or user ownership checks fail."""
    pass

class AIError(StudioError):
    """Raised when AI agent or OpenAI operations fail."""
    pass

class AgentResponseError(AIError):
    """Raised when AI agent returns empty or malformed JSON responses."""
    pass

class RetrieverError(StudioError):
    """Raised when document retrieval or vector search fails."""
    pass

class DatabaseError(RetrieverError):
    """Raised when Cosmos DB (MongoDB) or PostgreSQL operations fail."""
    pass

class ParsingError(StudioError):
    """Raised when document parsing, chunking, or markdown conversion fails."""
    pass

class StorageError(StudioError):
    """Raised when Azure Blob Storage operations fail."""
    pass

class ConversionError(StudioError):
    """Raised when document conversion (e.g., Gotenberg) fails."""
    pass

class ExternalServiceError(StudioError):
    """Raised when external APIs like Perplexity or Firecrawl fail."""
    pass

class InternalServerError(StudioError): 
    pass