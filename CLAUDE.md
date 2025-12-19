# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Monorepo (Root)
```bash
# Install all dependencies (pnpm workspaces)
pnpm install

# Run frontend dev server
pnpm dev

# Build all packages
pnpm build

# Run tests across all packages
pnpm test

# Lint all packages
pnpm lint

# Type check all packages
pnpm type-check

# Performance checks
pnpm check:bundle-sizes
pnpm check:circular-deps
pnpm performance:all
```

### Frontend (Next.js)
```bash
cd frontend

# Development server (runs env validation first)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

### Backend (FastAPI)
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run development server
python server.py

# Alternative: Run with uvicorn directly
uvicorn server:app --host 0.0.0.0 --port 8000 --reload

# Regenerate requirements after changes to requirements.in
pip-compile requirements.in -o requirements.txt --resolver=backtracking

# Run tests
pytest tests/
```

## Architecture Overview

This is a **pnpm monorepo** using **Turborepo** for build orchestration. It's a full-stack application for AI-powered document analysis and template generation, specifically designed for financial analysis, M&A due diligence, and investment research.

### Monorepo Structure

```
studio/
├── frontend/           # Next.js 14 application
├── backend/            # FastAPI Python server
├── packages/           # 9 shared TypeScript packages
│   ├── @studio/api     # API clients and database operations
│   ├── @studio/auth    # Authentication components and providers
│   ├── @studio/core    # Shared types, config, and utilities
│   ├── @studio/notifications  # Toast notifications system
│   ├── @studio/projects      # Project management components
│   ├── @studio/results       # Results display and export
│   ├── @studio/storage       # File handling and storage operations
│   ├── @studio/templates     # Template management components
│   └── @studio/ui            # Shared UI components
├── infrastructure/     # Bicep/Terraform deployment configs
├── scripts/            # Build and performance scripts
└── legacy/             # Deprecated utilities
```

### Frontend Architecture
- **Framework**: Next.js 14 with TypeScript and App Router
- **Styling**: Tailwind CSS with custom components
- **Authentication**: Azure Active Directory (Azure AD/Microsoft Identity)
- **State Management**: React hooks with local state
- **Build Tool**: Turborepo for monorepo orchestration
- **Package Manager**: pnpm with workspaces
- **Key Features**:
  - Project-based document organization
  - Template creation and management
  - File upload and processing with progress tracking
  - Real-time status updates via SSE
  - Drag-and-drop project organization (active/inactive)
  - Web page crawling and import

### Backend Architecture
- **Framework**: FastAPI with async/await support
- **AI Integration**: Azure OpenAI API for embeddings and generation
- **Vector Database**: Azure Cosmos DB for MongoDB vCore
- **Document Processing**: PyMuPDF for PDFs, MarkItDown for Office/HTML files
- **Storage**: Azure Blob Storage for file persistence
- **External Services**: Perplexity AI for web search, Firecrawl for web scraping

### Backend Module Organization (22 Python files)

```
backend/
├── server.py           # FastAPI server with 19 endpoints, SSE support
├── templates.py        # Template extraction from documents
├── external.py         # External search and scraping integrations
├── conversational.py   # Conversational AI project creation
├── ai/
│   ├── agent.py        # AI prompt engineering and response generation
│   └── prompts.py      # AI prompt templates and formatting
├── clients/
│   ├── cosmos.py       # Cosmos DB vector database operations
│   ├── storage.py      # Azure Blob Storage operations
│   ├── openai.py       # Azure OpenAI client singleton
│   └── document_intelligence.py  # Azure Document Intelligence
├── pipeline/
│   ├── main.py         # Pipeline class orchestrating retrieval and generation
│   ├── convert.py      # Document parsing and chunking (PDF, Office, HTML)
│   ├── citations.py    # Citation processing and scoring
│   ├── context.py      # Context window management
│   ├── search.py       # Search orchestration
│   └── similarity.py   # Similarity calculations
├── core/
│   └── config.py       # Environment configuration and constants
└── tests/
    ├── conftest.py     # Test fixtures
    └── test_e2e.py     # End-to-end tests
```

### Shared Packages Detail

#### @studio/api (21 files)
API clients for backend communication and database operations:
- `azure-api-client.ts` - Backend API integration
- `azure-db-client.ts` - Direct PostgreSQL database operations
- `azure-blob-client.ts` - File upload handling
- `backend-client.ts` - Backend server communication
- `enhancement-api.ts` - AI enhancement features
- `runtime-config.ts` - Runtime configuration
- `apimClient.ts` - Azure API Management client
- `msalClient.ts` - MSAL authentication client
- `logAnalytics.ts` - Azure Log Analytics integration
- `lib/database/` - Database operation modules

#### @studio/auth (14 files)
Authentication components and providers:
- `AuthForm.tsx` - Login/signup forms
- `auth-provider.tsx` - Authentication context provider
- `useUserProfile.ts` - User profile hook

#### @studio/core (20 files)
Shared types, configuration, and utilities:
- `types/database.ts` - Database entity types
- `types/project-metadata.ts` - Project metadata interfaces
- `types/results.ts` - Results and citations types
- `utils/errorUtils.ts` - Error handling utilities
- `utils/fileValidation.ts` - File validation logic
- `utils/tagUtils.ts` - Tag parsing utilities
- `lib/permissions.ts` - Permission checking

#### @studio/notifications (12 files)
Toast notification system:
- `NotificationProvider.tsx` - Context provider
- `NotificationContainer.tsx` - Toast display
- `useNotifications.ts` - Notification hook
- `useOffline.tsx` - Offline detection
- `useRetry.ts` - Retry logic for failed operations

#### @studio/projects (20 files)
Project management components and hooks:
- `CreateProjectModal.tsx` - New project creation
- `ShareProjectModal.tsx` - Project sharing UI
- `ProjectTabs.tsx` - Project navigation tabs
- `ProjectListView.tsx` - Project grid/list display
- `ProjectMetadataDisplay.tsx` - Metadata viewer
- `ProjectFileSelector.tsx` - File selection for projects
- `ProjectTemplateSelector.tsx` - Template selection for projects
- `SearchAgent.tsx` - Web search agent UI
- `useProjects.ts` - Projects CRUD hook
- `useProjectSharing.ts` - Sharing functionality
- `useProjectMembers.ts` - Project member management
- `useUserSearch.ts` - User search functionality
- `project-cache-manager.ts` - Client-side caching

#### @studio/results (26 files)
Results display and export functionality:
- `ResultsDisplay.tsx` - Main results viewer
- `ContextViewer.tsx` - Source context display
- `citations/` - Citation analysis components
  - `CitationAIAnalysis.tsx` - AI-powered citation analysis
  - `ExcelCitationViewer.tsx` - Excel-specific citation viewing
- `display/` - Chart, Table, Text display components
- `evidence/` - Evidence analysis display
  - `ErrorDisplay.tsx` - Error display component
- `excelExport.ts` - Excel export utility
- `wordExport.ts` - Word document export

#### @studio/storage (12 files)
File handling and cloud integrations:
- `FileLibrary.tsx` - File browser component
- `GroupedFileList.tsx` - Grouped file display
- `LocalFilesBrowser.tsx` - Local file browsing component
- `useFileUpload.ts` - File upload hook
- `useFileProcessing.ts` - Processing status hook
- `file-cache-manager.ts` - File caching

#### @studio/templates (25 files)
Template management and field processing:
- `TemplateLibrary.tsx` - Template browser
- `FieldList.tsx` / `DraggableFieldList.tsx` - Field management
- `FieldCard.tsx` - Individual field display
- `CreateTemplateModal.tsx` - Template creation
- `GenerateTemplateModal.tsx` - AI template generation from description
- `GenerateTemplateFromDocumentModal.tsx` - AI template generation from documents
- `ProcessButton.tsx` - Field processing trigger
- `QuestionsPanel.tsx` - Questions/fields panel
- `useTemplateEditor.ts` - Template editing hook
- `useFieldProcessor.ts` - Field processing hook
- `useFileOperations.ts` - File operations hook for templates
- `template-cache-manager.ts` - Template caching

#### @studio/ui (16 files)
Shared UI components:
- `AccountDropdown.tsx` - User account menu
- `FileManagerModal.tsx` - File management modal
- `ErrorBoundary.tsx` - React error boundary
- `MarkdownText.tsx` - Markdown renderer
- `ConsentDialog.tsx` - Consent/confirmation dialog
- `markdownToHtml.ts` - Markdown conversion
- `chartToImage.ts` - Chart export utility
- `useFileLibrary.ts` - File library hook

### Frontend App Structure

```
frontend/app/
├── api/                    # 49 Next.js API routes
│   ├── auth/               # Authentication endpoints
│   ├── projects/           # Project CRUD
│   ├── templates/          # Template operations
│   ├── fields/             # Field management
│   ├── files/              # File upload/download
│   ├── runs/               # Template execution
│   ├── results/            # Results retrieval
│   ├── process/            # Field processing (SSE)
│   ├── users/              # User file operations
│   ├── web/                # URL search and crawling
│   ├── conversational/     # AI project creation
│   └── [feature]/          # Feature-specific endpoints
├── auth/                   # Auth pages (signin, callback, signout)
├── dashboard/              # Main dashboard page
└── projects/[projectId]/   # Project and template pages
```

### Backend API Endpoints

Key endpoints in `server.py` (19 total):
- `GET /health` - Health check
- `GET /debug/cosmos` - Debug Cosmos DB connection
- `GET /debug/file/{file_id}` - Debug file information
- `POST /generate-template` - AI template generation from description
- `POST /conversational/create-project` - AI-assisted project creation
- `POST /search-urls` - Web search via Perplexity
- `POST /crawl-urls` - Web page crawling via Firecrawl
- `POST /enhance-field-description` - AI field description enhancement
- `GET /process/field/{field_id}/stream` - SSE field processing stream
- `POST /process/field/{field_id}/start` - Start field processing
- `POST /process/field/{field_id}/abort` - Abort field processing
- `GET /users/{user_id}/files/{file_id}/process/stream` - File processing stream
- `POST /users/{user_id}/files/{file_id}/generate-template` - Generate template from file
- `POST /users/{user_id}/files/{file_id}/abort-template` - Abort template generation
- `POST /users/{user_id}/files/{file_id}/abort` - Abort file processing
- `DELETE /users/{user_id}/files/{file_id}` - Delete user file
- `POST /export-chart-excel` - Export chart data to Excel
- `GET /playground` - Testing playground UI (HTML response)
- `POST /playground/process` - Process playground requests

### Data Flow
1. Users create **Projects** with rich business context metadata
2. Upload documents to Projects via frontend (drag-drop, file picker, or web crawl)
3. Backend processes documents using PyMuPDF/MarkItDown and creates embeddings
4. Embeddings stored in Cosmos DB with metadata
5. Templates define analysis fields and descriptions
6. Pipeline retrieves relevant document chunks via vector search
7. AI generates responses with source citations and similarity scores
8. Results displayed with evidence analysis and export options

### Database Schema (PostgreSQL)
- **projects** - Main organizational containers with JSONB metadata
- **files** - Document storage with processing status, file_map, page_map
- **templates** - Reusable analysis structures with version history in metadata
- **fields** - Individual analysis components within templates
- **runs** - Template execution history with snapshot support
- **results** - Generated analysis outputs with citations
- **Junction Tables**:
  - `project_files` - Links projects to files (many-to-many)
  - `project_templates` - Links projects to templates (many-to-many)
  - `template_sharing` - Template access permissions
  - `project_sharing` - Project access permissions
- **users** - User profiles synced from Azure AD

### Key Integrations
- **Azure SQL Database**: PostgreSQL for relational data
- **Azure OpenAI**: GPT-4o for generation, text-embedding-3-large for embeddings
- **Cosmos DB MongoDB vCore**: Vector similarity search
- **Azure Blob Storage**: File storage and retrieval
- **Azure Identity**: Authentication via MSAL
- **Azure API Management**: API gateway and management
- **Azure Log Analytics**: Logging and monitoring
- **Perplexity AI**: Web search functionality
- **Firecrawl**: Web page scraping

### Environment Variables

#### Root/Frontend
- `NEXT_PUBLIC_BACKEND_SERVER_URL` - Backend API URL
- Azure AD credentials (client ID, tenant, etc.)
- Database connection strings

#### Backend
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`
- `COSMOS_MONGODB_CONNECTION_STRING`
- `AZURE_STORAGE_ACCOUNT_NAME`, `AZURE_STORAGE_ACCOUNT_KEY`
- `EMBEDDING_MODEL_NAME` (default: text-embedding-3-large)
- `GENERATION_MODEL_NAME` (default: gpt-4o)
- `PERPLEXITY_API_KEY`, `FIRECRAWL_API_KEY`

## Current Production Deployments

Two active production deployments exist:

1. **Personal Production** (studio-prod-rg)
   - Subscription: e32ace51-daff-4a2d-a714-ade432a3b802
   - MongoDB: studio-prod-mongo (Running)
   - PostgreSQL: studio-prod-postgres (Running)
   - URLs: studio-prod-backend/frontend.azurewebsites.net

2. **Sallyport Client** (sallyport-studio-prod-rg)
   - Subscription: ca5bdeeb-7b84-4fca-82a3-735439933eaa
   - MongoDB: sallyport-studio-prod-mongo (Running)
   - PostgreSQL: sallyport-studio-prod-postgres (Running)
   - URLs: sallyport-backend/frontend-*.centralus-01.azurewebsites.net

## Important Implementation Notes

### Monorepo Conventions
- All shared code lives in `packages/` with `@studio/` namespace
- Frontend imports packages via `workspace:*` protocol
- Turborepo handles build ordering and caching
- Each package has its own `tsup.config.ts` for bundling
- Tests use Vitest with package-specific configs

### File Processing
- Supports PDF, Word, Excel, PowerPoint, HTML, and text files
- Multiprocessing for large PDF files (parallel page processing)
- Token-based chunking with configurable limits (1024 tokens default)
- Automatic metadata extraction using AI analysis
- Progress tracking with cancellation support via SSE

### Vector Search
- Embeddings generated using Azure OpenAI text-embedding-3-large
- Cosmos DB MongoDB vCore for vector storage
- Similarity search with metadata filtering
- User namespace isolation for security

### Performance Optimizations
- Turborepo caching for builds
- Batch processing for multiple files
- Concurrent API calls with semaphores (configurable concurrency)
- Connection pooling for database operations
- Lazy initialization of expensive resources
- Client-side caching via cache managers in each package

### Error Handling
- Graceful degradation for failed file processing
- Retry mechanisms with exponential backoff
- User-friendly error messages via notification system
- Processing status persistence across sessions

## Common Development Tasks

### Adding a New Shared Component
1. Decide which package it belongs to (@studio/ui, @studio/projects, etc.)
2. Create component in `packages/{pkg}/src/components/`
3. Export from package's `index.ts`
4. Run `pnpm build` to rebuild packages
5. Import in frontend using `@studio/{pkg}`

### Adding a New API Endpoint
1. Add route handler in `frontend/app/api/{feature}/route.ts`
2. If backend processing needed, add endpoint in `backend/server.py`
3. Add client function in appropriate package (@studio/api typically)

### Adding a New Project Type
1. Update `ProjectMetadata` interface in `packages/core/src/types/project-metadata.ts`
2. Add UI controls in `packages/projects/src/components/`
3. Update backend processing if needed

### Modifying Template Structure
1. Update database schema if needed (`azure_schema.sql`)
2. Modify Field interface in `packages/core/src/types/database.ts`
3. Update components in `packages/templates/src/components/`

### Adding File Format Support
1. Extend Parse class in `backend/pipeline/convert.py`
2. Add format detection logic
3. Update file validation in `packages/core/src/utils/fileValidation.ts`

### Implementing New AI Features
1. Add prompts to `backend/ai/prompts.py`
2. Extend Agent class in `backend/ai/agent.py`
3. Update Pipeline in `backend/pipeline/main.py`
4. Add frontend integration in appropriate package
