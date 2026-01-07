"""
Centralized configuration for backend services.
All environment variables and constants should be defined here.
"""

import os
from dotenv import load_dotenv

# Load environment variables once at module level
load_dotenv()


# ============================================================================
# Azure OpenAI Configuration
# ============================================================================
AZURE_OPENAI_API_KEY = os.getenv("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION")
AZURE_OPENAI_ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
MODEL_NAME = os.getenv("MODEL_NAME")
SMALL_MODEL_NAME = os.getenv("SMALL_MODEL_NAME")

# Azure Document Intelligence
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
AZURE_DOCUMENT_INTELLIGENCE_KEY = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")
DOCUMENT_INTELLIGENCE_MODEL_ID = "prebuilt-layout"


# ============================================================================
# Azure Storage Configuration
# ============================================================================
AZURE_STORAGE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
AZURE_STORAGE_ACCOUNT_KEY = os.getenv("AZURE_STORAGE_ACCOUNT_KEY")
AZURE_STORAGE_CONTAINER_NAME = os.getenv("AZURE_STORAGE_CONTAINER_NAME")


# ============================================================================
# PostgreSQL Configuration
# ============================================================================
PGHOST = os.getenv("PGHOST")
PGPORT = int(os.getenv("PGPORT"))
PGDATABASE = os.getenv("PGDATABASE")
PGUSER = os.getenv("PGUSER")
PGPASSWORD = os.getenv("PGPASSWORD")


# ============================================================================
# Cosmos DB Configuration
# ============================================================================
# Connection settings
COSMOS_MONGODB_CONNECTION_STRING = os.getenv("COSMOS_MONGODB_CONNECTION_STRING")
COSMOS_DATABASE_NAME = os.getenv("COSMOS_DATABASE_NAME")
COSMOS_COLLECTION_NAME = os.getenv("COSMOS_COLLECTION_NAME")
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME")

# Performance tuning
COSMOS_BATCH_SIZE = 40
COSMOS_RATE_LIMIT_DELAY = 0.5
COSMOS_EMBEDDING_BATCH_DELAY = 0.05
COSMOS_MAX_EMBEDDING_BATCH_SIZE = 500

# MongoDB connection pool
COSMOS_MAX_POOL_SIZE = 100
COSMOS_MIN_POOL_SIZE = 10
COSMOS_MAX_IDLE_TIME_MS = 45000
COSMOS_SERVER_SELECTION_TIMEOUT_MS = 5000
COSMOS_CONNECT_TIMEOUT_MS = 10000
COSMOS_SOCKET_TIMEOUT_MS = 30000


# ============================================================================
# Retrieval Pipeline Configuration
# ============================================================================
RETRIEVAL_TOP_K_PER_QUERY = 50
RETRIEVAL_TIMEOUT_SECONDS = 300
CONTEXT_MAX_TOKENS = 75000


# ============================================================================
# Document Parsing Configuration
# ============================================================================
# Chunking settings for text documents (PDF, Word, HTML, Markdown)
PARSE_MAX_TOKENS = 1024
PARSE_OVERLAP_TOKENS = 128
PARSE_TOKENIZER_ENCODING = "cl100k_base"

# Table processing limits
TABLE_MAX_TOKENS_PER_CHUNK = 7000
TABLE_EMPTY_ROW_THRESHOLD = 100
TABLE_MAX_ROWS_TO_SCAN = 100000

# File type extensions
CONVERTIBLE_EXTENSIONS = {".docx", ".doc", ".pptx", ".ppt", ".txt", ".rtf", ".odt"}
TABLE_EXTENSIONS = {".xlsx", ".xls", ".csv"}
TEXT_EXTENSIONS = {".md"}
DOCUMENT_EXTENSIONS = {".pdf"} | CONVERTIBLE_EXTENSIONS


# ============================================================================
# AI Configuration
# ============================================================================
AI_TEMPERATURE = 0.0
AI_TIMEOUT_SECONDS = 30
DEBUG_SAVE_PROMPTS = False

# Conversational AI temperature
CONVERSATIONAL_TEMPERATURE = 0.2

# Template generation settings
TEMPLATE_GENERATION_TEMPERATURE = 0.0
TEMPLATE_MAX_TOKENS = 80000


# ============================================================================
# Processing Configuration
# ============================================================================
LINE_GAP_THRESHOLD = 5
NUMBER_MATCH_BOOST = 0.30
TAG_PATTERN = r"\[(\d+(?:-\d+)?[A-Z]?)\]"


# ============================================================================
# Server Configuration
# ============================================================================
CORS_ORIGINS = os.getenv("CORS_ORIGINS")

# Concurrency limits
FILE_PROCESSING_CONCURRENCY = 10
SECTION_PROCESSING_CONCURRENCY = 10
URL_CRAWL_CONCURRENCY = 10


# ============================================================================
# External API Configuration
# ============================================================================
PERPLEXITY_API_KEY = os.getenv("PERPLEXITY_API_KEY")
FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY")

# Gotenberg document conversion service
GOTENBERG_URL = os.getenv("GOTENBERG_URL")

# Perplexity search settings
PERPLEXITY_MAX_TOKENS_PER_PAGE = 1024

# Firecrawl scraping settings
FIRECRAWL_WAIT_TIMEOUT = 120


# ============================================================================
# Chart Export Configuration
# ============================================================================
COLOR_SCHEMES = {
    "default": [
        "#3b82f6",
        "#10b981",
        "#f59e0b",
        "#ef4444",
        "#8b5cf6",
        "#ec4899",
        "#06b6d4",
        "#84cc16",
    ],
    "blue": [
        "#3b82f6",
        "#60a5fa",
        "#93c5fd",
        "#1e40af",
        "#2563eb",
        "#1d4ed8",
        "#1e3a8a",
        "#172554",
    ],
    "green": [
        "#10b981",
        "#34d399",
        "#6ee7b7",
        "#059669",
        "#047857",
        "#065f46",
        "#064e3b",
        "#022c22",
    ],
    "purple": [
        "#8b5cf6",
        "#a78bfa",
        "#c4b5fd",
        "#7c3aed",
        "#6d28d9",
        "#5b21b6",
        "#4c1d95",
        "#2e1065",
    ],
    "warm": [
        "#ef4444",
        "#f59e0b",
        "#f97316",
        "#dc2626",
        "#ea580c",
        "#d97706",
        "#c2410c",
        "#92400e",
    ],
    "cool": [
        "#06b6d4",
        "#0ea5e9",
        "#3b82f6",
        "#0891b2",
        "#0284c7",
        "#2563eb",
        "#0e7490",
        "#075985",
    ],
}
