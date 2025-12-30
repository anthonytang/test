# Studio Backend Testing Playground

An interactive web-based testing environment for the Studio backend pipeline.

## Quick Start

### 1. Start the Backend Server

```bash
cd backend
./venv/bin/python server.py
```

The server will start on `http://localhost:8000`

### 2. Open the Playground

Navigate to: **http://localhost:8000/playground**

---

## What is the Playground?

The playground is a visual, interactive testing tool that lets you test the complete document processing pipeline end-to-end. It shows you every step of the process with detailed logs and metrics.

### Pipeline Steps Visualized

1. **📋 Processing Logs** - Real-time logs showing what's happening behind the scenes
2. **🔍 Search Queries Generated** - AI-generated queries for vector search
3. **📄 Retrieved Chunks** - Document chunks with similarity scores, page/line info, and lengths
4. **📝 Numbered Context** - The exact context sent to the AI (only retrieved chunks, not entire file)
5. **📌 Cited Sources** - Specific lines referenced by the AI response
6. **💬 AI Response with Citations** - Final response with highlighted citation tags

---

## How to Use

### Basic Test (No File Upload)

1. Enter a **section name**: `Revenue Analysis`
2. Enter a **section description**: `What was the company's revenue in Q4 2024?`
3. Click **"Run Pipeline"**
4. Review the mock response to understand the pipeline flow

### Full Test (With File Upload)

1. Click **"Upload Files"** and select documents (PDF, Excel, Word, etc.)
2. Enter a **section name** and **section description** relevant to your file
3. Click **"Run Pipeline"**
4. Watch the processing logs in real-time
5. Review each pipeline stage:
   - See how many pages were parsed
   - How many chunks were created
   - How many chunks matched your query
   - Which chunks the AI actually cited

---

## What You'll See

### Processing Logs Example

```
• Generated 6 search queries
• Processing 1 uploaded file(s)
• Parsed 30 pages from AAPL_10Q_Q2_2025.pdf
• Created 30 chunks from AAPL_10Q_Q2_2025.pdf
• Stored 30 chunks with embeddings in Cosmos DB
• Retrieved 23 unique chunks from search
• Built context with 147 lines (~45,231 tokens)
• Generating AI response...
• AI response generated successfully
```

### Enhanced Chunk Display Example

```
Chunk 1: AAPL_10Q_Q2_2025.pdf | Similarity: 0.892
📍 Page 12, Lines 1758-1789 | 📏 1,245 chars, 312 tokens, 32 lines
[chunk text preview...]
```

Each chunk shows:
- **File name** - Source document
- **Similarity score** - How well it matches the query (0-1 scale)
- **Page range** - e.g., "Page 12" or "Pages 12-14"
- **Line range** - Exact lines in document
- **Character count** - Total characters
- **Token count** - For understanding context budget
- **Line count** - Number of lines

---

## What Gets Tested

The playground exercises the **complete production pipeline**:

```
File Upload (optional)
    ↓
Document Parsing (PyMuPDF, MarkItDown)
    ↓
Chunk Extraction & Embedding (Azure OpenAI)
    ↓
Vector Storage (Cosmos DB)
    ↓
Section Description
    ↓
Search Query Generation (Azure OpenAI)
    ↓
Vector Search (Cosmos DB)
    ↓
Context Building (80k token budget)
    ↓
AI Response Generation (Azure OpenAI GPT-4o)
    ↓
Citation Parsing & Highlighting
```

---

## Key Features

### 1. Full Transparency

Unlike terminal logs you can't access, the playground shows:
- ✅ Every processing step
- ✅ Token counts and chunk metrics
- ✅ Similarity scores for each chunk
- ✅ Which chunks were actually cited
- ✅ Page and line numbers for every chunk

### 2. Verified Context Window

The **Numbered Context** section shows ONLY the retrieved chunks, not the entire file:
- Context is built from search results (typically 15-25 chunks)
- Further filtered to fit 80,000 token budget
- You can verify exactly what the AI sees

### 3. Citation Verification

The **Cited Sources** section shows only the lines the AI referenced:
- Extracts citation tags like `[1758-1759]`, `[1989]`
- Displays the actual text from those line numbers
- Includes source file and page information

---

## Supported File Types

- **PDF** - Parsed using PyMuPDF and Azure Document Intelligence
- **Excel/CSV** - Tabular data extraction
- **Word** - .docx files
- **HTML** - Web content
- **Markdown** - .md files
- **Text** - Plain text files

---

## Configuration

### Environment

The playground uses your main backend environment settings from `backend/.env`:
- **Cosmos DB** - Stores chunks in "playground" namespace (isolated from production)
- **Azure OpenAI** - Generates embeddings and responses
- **PostgreSQL** - Not used by playground (no permanent storage)

### SSL Certificate Issue (macOS)

If you see "No chunks retrieved" errors, you may need to fix Python SSL certificates:

```bash
# Install SSL certificates for Python
/Applications/Python\ 3.12/Install\ Certificates.command
```

Or if using Homebrew:

```bash
pip install --upgrade certifi
```

Alternatively, in `backend/clients/cosmos.py`, add these parameters to MongoClient (line 53):

```python
tls=True,
tlsAllowInvalidCertificates=True  # For local dev only
```

---

## Troubleshooting

### "No chunks retrieved"

This can happen when:
- **No files uploaded** → Playground uses mock context data
- **Files don't contain relevant info** → Try more specific search queries
- **SSL certificate error** → See configuration section above

### Slow Processing

- **File parsing** takes 5-10 seconds per file (Document Intelligence API)
- **Embedding generation** adds 2-5 seconds per batch
- **Search** is typically under 1 second
- **AI response** takes 1-3 seconds

Total: **10-20 seconds for a complete pipeline run with file upload**

### No Logs Showing

- Check browser console for errors
- Verify server is running on port 8000
- Try refreshing the page

---

## Comparison: Playground vs Unit Tests

| Feature | Playground | Unit Tests |
|---------|-----------|------------|
| **Speed** | 10-20 sec/run | 3 sec for all |
| **Interactivity** | ✅ Visual UI | ❌ Terminal only |
| **Real files** | ✅ Upload any file | ❌ Mock data |
| **Full pipeline** | ✅ End-to-end | ❌ Individual functions |
| **Use case** | Manual testing, demos | Automated CI/CD |
| **Logs visibility** | ✅ In-browser | ❌ Terminal only |

**Recommendation:** Use the playground for development and testing. Unit tests are available but less useful for this use case.

---

## Advanced Usage

### Testing Different Output Formats

The playground currently uses `TEXT` output format. To test `TABLE` or `CHART` formats, modify the endpoint in `server.py` line 1710:

```python
output_format="TABLE"  # or "CHART"
```

### Testing Large Documents

Upload a 50+ page PDF to see:
- How chunks are distributed across pages
- Which pages have the highest similarity scores
- Token budget management in action

### Comparing Search Quality

Try different section descriptions for the same file:
- **Specific**: "What was Apple's iPhone revenue in Q2 2025?"
- **General**: "Summarize the financial performance"
- **Technical**: "What were the operating margins by segment?"

Compare similarity scores and which pages are retrieved.

---

## Files

**Core Files:**
- `backend/playground.html` - Frontend UI (475 lines)
- `backend/server.py` - Contains `/playground` and `/playground/process` endpoints
- `backend/PLAYGROUND.md` - Detailed playground documentation

**Related Files:**
- `backend/pipeline/search.py` - Query generation
- `backend/pipeline/context.py` - Context building
- `backend/pipeline/citations.py` - Citation extraction
- `backend/ai/agent.py` - AI response generation

---

## Example Workflow

Here's what happens when you upload a 10-Q filing and ask about revenue:

1. **Upload** → `AAPL_10Q_Q2_2025.pdf` (30 pages)
2. **Parse** → 30 page chunks extracted
3. **Embed** → 30 vector embeddings generated
4. **Store** → Chunks saved to Cosmos DB
5. **Query** → AI generates: "Q2 2025 revenue", "iPhone revenue Q2", etc.
6. **Search** → Returns 23 matching chunks (avg similarity: 0.847)
7. **Context** → Fits 18 chunks in 80k token budget
8. **Generate** → AI writes response citing specific chunks
9. **Citations** → Extracts `[1758-1759]`, `[1989]` and shows source text

**Total time:** ~15 seconds

**Result:** You can see exactly which pages/lines the AI used to answer your question!

---

## Next Steps

- Explore the pipeline with your own documents
- Test edge cases (corrupted files, empty PDFs, huge Excel sheets)
- Compare different query strategies
- Verify citation accuracy

For production deployment testing, see the main backend documentation.
