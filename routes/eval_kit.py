"""Evaluation kit endpoints: playground, tester, batch runner."""

import json
import logging
import re
import tempfile
from datetime import datetime
from pathlib import Path
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

import tiktoken

from ai import Agent, OutputFormat, EVALUATION_SYSTEM_PROMPT, EVALUATION_PROMPT
from ai.prompts import build_template_prompt_with_format
from clients import get_cosmos_client
from clients.openai import create_azure_client
from core import File as CitationFile
from core.types import Meta
from pipeline import get_parser
from pipeline.context import Context
from pipeline.search import Search

logger = logging.getLogger(__name__)
router = APIRouter()

# Base paths
EVAL_KIT_DIR = Path(__file__).parent.parent / "eval_kit"


# =============================================================================
# Playground Endpoints
# =============================================================================


@router.get("/playground", response_class=HTMLResponse)
async def serve_playground():
    """Serve the modular playground HTML from playground directory."""
    html_path = EVAL_KIT_DIR / "playground" / "index.html"

    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Playground HTML not found")

    with open(html_path, "r") as f:
        return HTMLResponse(content=f.read())


@router.get("/playground/styles.css")
async def serve_playground_styles():
    """Serve the playground CSS file."""
    css_path = EVAL_KIT_DIR / "playground" / "styles.css"

    if not css_path.exists():
        raise HTTPException(status_code=404, detail="Playground CSS not found")

    return FileResponse(css_path, media_type="text/css")


@router.get("/playground/script.js")
async def serve_playground_script():
    """Serve the playground JavaScript file."""
    js_path = EVAL_KIT_DIR / "playground" / "script.js"

    if not js_path.exists():
        raise HTTPException(status_code=404, detail="Playground JS not found")

    return FileResponse(js_path, media_type="application/javascript")


@router.post("/playground/process")
async def process_playground(
    files: List[UploadFile] = File(default=[]),
    section_name: str = Form(...),
    section_description: str = Form(...),
    model_name: str = Form(default="gpt-4o"),
    output_format: str = Form(default="text"),
):
    """
    Process playground request with custom model selection.

    Returns:
        - queries: List of generated search queries
        - chunks: Retrieved chunks with similarity scores
        - context: Numbered context sent to AI
        - response: Final AI response with citations
        - model_used: The model name that was used
    """
    try:
        # Processing logs
        processing_logs = []
        processing_logs.append(f"Using model: {model_name}")
        processing_logs.append(f"Output format: {output_format}")

        # Convert output_format string to enum
        format_enum = OutputFormat(output_format.lower())

        # Create custom Azure OpenAI client and Agent with specified model
        custom_client = create_azure_client()
        custom_agent = Agent(model=model_name, azure_client=custom_client)

        # Step 1: Generate search queries (using custom agent)
        search = Search()
        queries = await custom_agent.plan_retrieval(
            section_name=section_name,
            section_description=section_description,
            template_description="Dev playground test",
            project_description="Testing pipeline functionality",
        )
        processing_logs.append(f"Generated {len(queries)} search queries")

        # Step 2: Process uploaded files and execute search
        chunks = []
        file_ids = []

        if files:
            processing_logs.append(f"Processing {len(files)} uploaded file(s)")

            # Get cosmos client and parse instance
            cosmos_client = get_cosmos_client()
            parse = get_parser()

            total_chunks_created = 0

            # Process each uploaded file
            for uploaded_file in files:
                try:
                    # Generate unique file ID for playground
                    file_id = f"playground_{uuid4().hex[:8]}_{uploaded_file.filename}"
                    file_ids.append(file_id)

                    # Save file to temp directory
                    temp_dir = Path(tempfile.gettempdir()) / "playground_uploads"
                    temp_dir.mkdir(exist_ok=True)

                    file_path = temp_dir / uploaded_file.filename
                    with open(file_path, "wb") as f:
                        content = await uploaded_file.read()
                        f.write(content)

                    # Parse document to get page data
                    page_data, _ = await parse.parse_document(
                        str(file_path), uploaded_file.filename
                    )

                    if not page_data:
                        processing_logs.append(
                            f"Warning: No page data extracted from {uploaded_file.filename}"
                        )
                        continue

                    processing_logs.append(
                        f"Parsed {len(page_data)} pages from {uploaded_file.filename}"
                    )

                    # Create File object for build_chunks
                    file = CitationFile(id=file_id, name=uploaded_file.filename)

                    # Build chunks from page data (returns Parse object)
                    parse_result = parse.build_chunks(page_data, file)
                    file_chunks = parse_result.chunks

                    if not file_chunks:
                        processing_logs.append(
                            f"Warning: No chunks built from {uploaded_file.filename}"
                        )
                        continue

                    total_chunks_created += len(file_chunks)
                    processing_logs.append(
                        f"Created {len(file_chunks)} chunks from {uploaded_file.filename}"
                    )

                    # Create Meta object for playground (minimal metadata)
                    meta = Meta(
                        company=None,
                        ticker=None,
                        doc_type="Playground Test",
                        period_label=None,
                        blurb=None,
                    )

                    # Upsert chunks to Cosmos DB with embeddings (new API)
                    await cosmos_client.batch_upsert_documents(
                        chunks=file_chunks, namespace="playground", meta=meta
                    )

                    processing_logs.append(
                        f"Stored {len(file_chunks)} chunks with embeddings in Cosmos DB"
                    )

                    # Clean up temp file
                    file_path.unlink()

                except Exception as e:
                    processing_logs.append(
                        f"Error processing {uploaded_file.filename}: {str(e)}"
                    )
                    continue

            # Execute search queries if we have file IDs
            if file_ids:
                try:
                    all_chunks = await search._execute_search_queries(queries, file_ids)
                    chunks = search._deduplicate(all_chunks)
                    processing_logs.append(
                        f"Retrieved {len(chunks)} unique chunks from search"
                    )
                except Exception as e:
                    processing_logs.append(f"Search failed: {str(e)}")
                    chunks = []

        # Step 3: Build context
        context_builder = Context()
        if chunks:
            context_text, sources = context_builder.build(chunks)
            encoding = tiktoken.encoding_for_model("gpt-4o")
            token_count = len(encoding.encode(context_text))
            processing_logs.append(
                f"Built context with {len(sources)} sources (~{token_count:,} tokens)"
            )
        else:
            # Use mock context for demo when no files or no chunks retrieved
            context_text = """1. Document: Sample Financial Report (Test Company, TST, 10-K, FY 2024)
2. Revenue in Q4 2024 was $100 million.
3. This represents a 15% increase from Q4 2023.
4. The growth was driven by strong product sales.
5. Operating expenses increased by 8% year-over-year.
6. Net income was $25 million.
7. Earnings per share (EPS) was $1.50.
8. The company expects continued growth in 2025."""
            sources = {}
            processing_logs.append("Using mock context (no files uploaded)")

        # Step 4: Generate AI response with custom agent
        processing_logs.append(
            f"Generating AI response with {model_name} (format: {format_enum.value})"
        )
        response = await custom_agent.generate_response(
            context=context_text,
            section_name=section_name,
            section_description=section_description,
            template_description="Dev playground",
            project_description="Testing",
            output_format=format_enum,
            dependent_sections_context=None,
        )
        processing_logs.append("AI response generated successfully")

        # Handle different response formats
        response_data = None
        response_text = None

        if format_enum == OutputFormat.TEXT:
            # TEXT format returns string
            if isinstance(response, dict) and "raw" in response:
                response_text = response["raw"]
            else:
                response_text = response
        else:
            # TABLE/CHART formats return JSON dict
            if isinstance(response, dict):
                response_data = response
                # Also create a text representation for backward compatibility
                response_text = json.dumps(response, indent=2)
            else:
                # Fallback if something went wrong
                response_text = str(response)

        # Extract cited sources from response
        cited_context = ""
        if sources:
            citation_pattern = r"\[(\d+(?:-\d+)?)\]"
            found_tags = re.findall(citation_pattern, response_text)

            # Parse citation ranges to get all source IDs
            cited_ids = set()
            for tag in found_tags:
                if "-" in tag:
                    start, end = tag.split("-")
                    cited_ids.update(str(i) for i in range(int(start), int(end) + 1))
                else:
                    cited_ids.add(tag)

            # Build cited context from sources
            if cited_ids:
                cited_entries = []
                for source_id in sorted(
                    cited_ids, key=lambda x: int(x) if x.isdigit() else 0
                ):
                    if source_id in sources:
                        source = sources[source_id]
                        text = source.unit.text
                        file_name = source.file.name
                        unit_id = source.unit.id

                        entry = f"{source_id}. {text}"
                        if file_name != "Unknown":
                            entry += f" (Source: {file_name}, Unit {unit_id})"

                        cited_entries.append(entry)

                cited_context = "\n\n".join(cited_entries)

        # Build enhanced chunk info with page/line details
        enhanced_chunks = []
        for match in chunks:
            # Extract text from units
            text = "\n".join(unit.text for unit in match.units)
            num_lines = len(text.split("\n"))

            # Get page info from first and last unit locations
            if match.units:
                first_location = match.units[0].location
                last_location = match.units[-1].location

                page_start = first_location.page if first_location.page else 1
                page_end = last_location.page if last_location.page else page_start
            else:
                page_start = page_end = 1

            # Format page range
            if page_start == page_end:
                page_info = f"Page {page_start}"
            else:
                page_info = f"Pages {page_start}-{page_end}"

            # Line info (simplified since we don't have start_line in new structure)
            line_info = f"Lines 1-{num_lines}"

            enhanced_chunks.append(
                {
                    "text": text,
                    "file_name": match.file.name,
                    "similarity_score": match.score,
                    "page_info": page_info,
                    "line_info": line_info,
                    "char_count": len(text),
                    "token_count": match.tokens,
                    "line_count": num_lines,
                }
            )

        return JSONResponse(
            {
                "queries": queries,
                "chunks": enhanced_chunks,
                "chunks_total": len(chunks),
                "context": context_text,
                "cited_context": cited_context,
                "response": response_text,
                "response_data": response_data,  # JSON data for table/chart formats
                "processing_logs": processing_logs,
                "model_used": model_name,
                "output_format": format_enum.value,
            }
        )

    except Exception as e:
        logger.error(f"[PLAYGROUND] Error processing request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Tester Endpoints
# =============================================================================


@router.get("/tester", response_class=HTMLResponse)
async def serve_tester():
    """Serve the modular tester HTML from tester directory."""
    html_path = EVAL_KIT_DIR / "tester" / "index.html"

    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Tester HTML not found")

    with open(html_path, "r") as f:
        return HTMLResponse(content=f.read())


@router.get("/tester/styles.css")
async def serve_tester_styles():
    """Serve the tester CSS file."""
    css_path = EVAL_KIT_DIR / "tester" / "styles.css"

    if not css_path.exists():
        raise HTTPException(status_code=404, detail="Tester CSS not found")

    return FileResponse(css_path, media_type="text/css")


@router.get("/tester/script.js")
async def serve_tester_script():
    """Serve the tester JavaScript file."""
    js_path = EVAL_KIT_DIR / "tester" / "script.js"

    if not js_path.exists():
        raise HTTPException(status_code=404, detail="Tester JS not found")

    return FileResponse(js_path, media_type="application/javascript")


@router.get("/tester/test-cases")
async def get_test_cases():
    """Get all test cases from all_test_cases.json for the tester UI."""
    try:
        test_cases_path = EVAL_KIT_DIR / "sample_data" / "all_test_cases.json"

        if not test_cases_path.exists():
            return {}

        with open(test_cases_path, "r") as f:
            test_cases_array = json.load(f)

        # Ensure it's a list
        if not isinstance(test_cases_array, list):
            logger.error("all_test_cases.json is not a list")
            return {}

        # Convert array to dictionary format for tester UI compatibility
        # Use test_name as the key
        test_cases = {}
        for test_case in test_cases_array:
            if "test_name" in test_case:
                # Use test_name as the key (like "studioAI_sample_data.json")
                key = f"{test_case['test_name']}.json"
                test_cases[key] = test_case
            else:
                logger.warning("Test case missing test_name section, skipping")

        return test_cases

    except Exception as e:
        logger.error(f"Error listing test cases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tester/run")
async def run_test_case(
    test_case: str = Body(..., embed=True),
    model_name: str = Body(default="gpt-4o", embed=True),
    output_format: str = Body(default="text", embed=True),
):
    """
    Run a predefined test case with the specified model.

    Args:
        test_case: Filename of the test case JSON (e.g., "studioAI.json")
        model_name: Model to use for generation
        output_format: Output format (text, table, chart)

    Returns:
        Same format as playground/process endpoint
    """
    try:
        # Load test case from all_test_cases.json array
        test_cases_path = EVAL_KIT_DIR / "sample_data" / "all_test_cases.json"

        if not test_cases_path.exists():
            raise HTTPException(status_code=404, detail="Test cases file not found")

        with open(test_cases_path, "r") as f:
            test_cases_array = json.load(f)

        # Find the test case by matching the filename format
        # test_case parameter will be like "studioAI_sample_data.json"
        test_case_name = test_case.replace(".json", "")
        test_data = None
        for tc in test_cases_array:
            if tc.get("test_name") == test_case_name:
                test_data = tc
                break

        if not test_data:
            raise HTTPException(
                status_code=404, detail=f"Test case not found: {test_case}"
            )

        # Extract test case data
        section_name = test_data["section_name"]
        section_description = test_data["section_description"]
        file_paths = test_data["file_paths"]

        # Processing logs
        processing_logs = []
        processing_logs.append(f"Using model: {model_name}")
        processing_logs.append(f"Output format: {output_format}")
        processing_logs.append(f"Test case: {test_data.get('test_name', test_case)}")

        # Convert output_format string to enum
        format_enum = OutputFormat(output_format.lower())

        # Create custom Azure OpenAI client and Agent with specified model
        custom_client = create_azure_client()
        custom_agent = Agent(model=model_name, azure_client=custom_client)

        # Step 1: Generate search queries (using custom agent)
        search = Search()
        queries = await custom_agent.plan_retrieval(
            section_name=section_name,
            section_description=section_description,
            template_description=test_data["description"],
            project_description="Test case evaluation",
        )
        processing_logs.append(f"Generated {len(queries)} search queries")

        # Step 2: Process files and execute search
        chunks = []
        file_ids = []

        if file_paths:
            processing_logs.append(
                f"Processing {len(file_paths)} file(s) from test case"
            )

            # Get cosmos client and parse instance
            cosmos_client = get_cosmos_client()
            parse = get_parser()

            # Process each file from local filesystem
            for file_path in file_paths:
                try:
                    # Convert relative path to absolute path (relative to backend directory)
                    backend_dir = Path(__file__).parent.parent
                    if not file_path.startswith("/"):
                        # Relative path - make it relative to backend directory's parent
                        full_path = backend_dir.parent / file_path
                    else:
                        full_path = Path(file_path)

                    if not full_path.exists():
                        processing_logs.append(f"Warning: File not found: {file_path}")
                        continue

                    file_name = full_path.name
                    file_id = f"tester_{uuid4().hex[:8]}_{file_name}"
                    file_ids.append(file_id)

                    processing_logs.append(f"Processing {file_name}...")

                    # Parse document to get page data
                    page_data, _ = await parse.parse_document(str(full_path), file_name)

                    if not page_data:
                        processing_logs.append(
                            f"Warning: No page data extracted from {file_name}"
                        )
                        continue

                    processing_logs.append(
                        f"Parsed {len(page_data)} pages from {file_name}"
                    )

                    # Create File object for build_chunks
                    file = CitationFile(id=file_id, name=file_name)

                    # Build chunks from page data (returns Parse object)
                    parse_result = parse.build_chunks(page_data, file)
                    file_chunks = parse_result.chunks

                    if not file_chunks:
                        processing_logs.append(
                            f"Warning: No chunks built from {file_name}"
                        )
                        continue

                    processing_logs.append(
                        f"Created {len(file_chunks)} chunks from {file_name}"
                    )

                    # Create Meta object for tester (minimal metadata)
                    meta = Meta(
                        company=None,
                        ticker=None,
                        doc_type="Tester",
                        period_label=None,
                        blurb=None,
                    )

                    # Upsert chunks to Cosmos DB with embeddings (new API)
                    await cosmos_client.batch_upsert_documents(
                        chunks=file_chunks, namespace="tester", meta=meta
                    )

                    processing_logs.append(
                        f"Stored {len(file_chunks)} chunks with embeddings in Cosmos DB"
                    )

                except Exception as e:
                    processing_logs.append(f"Error processing {file_path}: {str(e)}")
                    logger.error(
                        f"[TESTER] Error processing file {file_path}: {e}",
                        exc_info=True,
                    )
                    continue

            # Execute search queries if we have file IDs
            if file_ids:
                try:
                    all_chunks = await search._execute_search_queries(queries, file_ids)
                    chunks = search._deduplicate(all_chunks)
                    processing_logs.append(
                        f"Retrieved {len(chunks)} unique chunks from search"
                    )
                except Exception as e:
                    processing_logs.append(f"Search failed: {str(e)}")
                    logger.error(f"[TESTER] Search failed: {e}", exc_info=True)
                    chunks = []
        else:
            processing_logs.append("No files specified in test case")

        # Step 3: Build context
        context_builder = Context()
        if chunks:
            context, sources = context_builder.build(chunks)
            encoding = tiktoken.encoding_for_model("gpt-4o")
            token_count = len(encoding.encode(context))
            processing_logs.append(
                f"Built context with {len(sources)} sources (~{token_count:,} tokens)"
            )
        else:
            # Use mock context if no chunks
            context = """1. Test case: No file data available
2. Files were not successfully processed or no files were specified."""
            sources = {}
            processing_logs.append("Using mock context (no chunks retrieved)")

        # Step 4: Generate AI response
        processing_logs.append(
            f"Generating AI response with {model_name} (format: {output_format})"
        )

        response_result = await custom_agent.generate_response(
            context=context,
            section_name=section_name,
            section_description=section_description,
            template_description=test_data["description"],
            project_description="Test case evaluation",
            output_format=format_enum,
            dependent_sections_context=None,
        )

        processing_logs.append("AI response generated successfully")

        # Step 5: Extract citations using sources
        cited_context = ""
        if (
            format_enum == OutputFormat.TEXT
            and isinstance(response_result, str)
            and sources
        ):
            # Find all citation tags like [1], [2-3], [1758-1759]
            citation_pattern = r"\[(\d+(?:-\d+)?)\]"
            found_tags = re.findall(citation_pattern, response_result)

            # Parse citation ranges to get all source IDs
            cited_ids = set()
            for tag in found_tags:
                if "-" in tag:
                    start, end = tag.split("-")
                    cited_ids.update(str(i) for i in range(int(start), int(end) + 1))
                else:
                    cited_ids.add(tag)

            # Build cited context from sources
            if cited_ids:
                cited_entries = []
                for source_id in sorted(
                    cited_ids, key=lambda x: int(x) if x.isdigit() else 0
                ):
                    if source_id in sources:
                        source = sources[source_id]
                        text = source.unit.text
                        file_name = source.file.name
                        unit_id = source.unit.id

                        entry = f"{source_id}. {text}"
                        if file_name != "Unknown":
                            entry += f" (Source: {file_name}, Unit {unit_id})"

                        cited_entries.append(entry)

                cited_context = "\n\n".join(cited_entries)
                processing_logs.append(f"Extracted {len(cited_entries)} cited sources")

        # Build enhanced chunk info with page/line details
        enhanced_chunks = []
        for match in chunks:
            # Extract text from units
            text = "\n".join(unit.text for unit in match.units)
            num_lines = len(text.split("\n"))

            # Get page info from first and last unit locations
            if match.units:
                first_location = match.units[0].location
                last_location = match.units[-1].location

                page_start = first_location.page if first_location.page else 1
                page_end = last_location.page if last_location.page else page_start
            else:
                page_start = page_end = 1

            # Format page range
            if page_start == page_end:
                page_info = f"Page {page_start}"
            else:
                page_info = f"Pages {page_start}-{page_end}"

            # Line info (simplified since we don't have line numbers in new structure)
            line_info = f"Lines 1-{num_lines}"

            enhanced_chunks.append(
                {
                    "text": text,
                    "file_name": match.file.name,
                    "similarity_score": match.score,
                    "page_info": page_info,
                    "line_info": line_info,
                    "char_count": len(text),
                    "token_count": match.tokens,
                    "line_count": num_lines,
                }
            )

        # Prepare response data
        response_text = response_result if format_enum == OutputFormat.TEXT else None
        response_data = (
            response_result
            if format_enum in (OutputFormat.TABLE, OutputFormat.CHART)
            else None
        )

        return {
            "queries": queries,
            "chunks": enhanced_chunks,
            "chunks_total": len(enhanced_chunks),
            "context": context,
            "cited_context": cited_context,
            "response": response_text,
            "response_data": response_data,
            "processing_logs": processing_logs,
            "model_used": model_name,
            "output_format": output_format,
            "test_case": test_data.get("test_name", test_case),
            "test_details": {
                "file_paths": file_paths,
                "section_name": section_name,
                "section_description": section_description,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TESTER] Error running test case: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tester/evaluate")
async def evaluate_test_result(
    context: str = Body(..., embed=True),
    section_name: str = Body(..., embed=True),
    section_description: str = Body(..., embed=True),
    template_description: str = Body(..., embed=True),
    project_description: str = Body(..., embed=True),
    output_format: str = Body(..., embed=True),
    output: str = Body(..., embed=True),
    requirements: List[str] = Body(..., embed=True),
    model_name: str = Body(default="gpt-4o", embed=True),
):
    """
    Evaluate the LLM output against requirements using another LLM call.
    The evaluator receives the same context as the generator LLM, plus evaluation instructions.

    Args:
        context: The numbered context that was sent to the generator
        section_name: Section name
        section_description: Section description
        template_description: Template description
        project_description: Project description
        output_format: Output format (text, table, chart)
        output: The generated LLM response
        requirements: List of requirements to evaluate against
        model_name: Model to use for evaluation

    Returns:
        Evaluation feedback from the LLM
    """
    try:
        # Create custom Azure OpenAI client with specified model
        custom_client = create_azure_client()

        # Build requirements text
        requirements_text = "\n".join(
            [f"{i+1}. {req}" for i, req in enumerate(requirements)]
        )

        # Convert output_format string to enum
        format_enum = OutputFormat(output_format.lower())

        # Build the generator's prompt (exactly what Agent.generate_response uses)
        generator_prompt = build_template_prompt_with_format(
            section_name=section_name,
            section_description=section_description,
            numbered_context=context,
            context_date=datetime.now().strftime("%Y-%m-%d"),
            template_description=template_description,
            project_description=project_description,
            output_format=format_enum,
            dependent_sections_context=None,
        )

        # Build evaluation prompt
        evaluation_prompt = EVALUATION_PROMPT.format(
            generator_prompt=generator_prompt,
            output=output,
            requirements_text=requirements_text,
        )

        # Determine temperature based on model
        # GPT-5.2 and o1 models only support temperature=1.0
        if "gpt-5" in model_name.lower() or model_name.lower().startswith("o1"):
            temperature = 1.0
        else:
            temperature = 0.3  # Lower temperature for more consistent evaluation

        # Call OpenAI API
        response = await custom_client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": EVALUATION_SYSTEM_PROMPT},
                {"role": "user", "content": evaluation_prompt},
            ],
            temperature=temperature,
        )

        feedback = response.choices[0].message.content

        return {
            "feedback": feedback,
            "model_used": model_name,
            "requirements_count": len(requirements),
        }

    except Exception as e:
        logger.error(f"[TESTER] Error evaluating test result: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Batch Runner Endpoints
# =============================================================================


@router.get("/batch", response_class=HTMLResponse)
async def serve_batch_runner():
    """Serve the batch runner HTML."""
    html_path = EVAL_KIT_DIR / "batch_runner" / "index.html"

    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Batch Runner HTML not found")

    with open(html_path, "r") as f:
        return HTMLResponse(content=f.read())


@router.get("/batch/styles.css")
async def serve_batch_styles():
    """Serve the batch runner CSS file."""
    css_path = EVAL_KIT_DIR / "batch_runner" / "styles.css"

    if not css_path.exists():
        raise HTTPException(status_code=404, detail="Batch Runner CSS not found")

    return FileResponse(css_path, media_type="text/css")


@router.get("/batch/script.js")
async def serve_batch_script():
    """Serve the batch runner JavaScript file."""
    js_path = EVAL_KIT_DIR / "batch_runner" / "script.js"

    if not js_path.exists():
        raise HTTPException(status_code=404, detail="Batch Runner JS not found")

    return FileResponse(js_path, media_type="application/javascript")


@router.get("/batch/test-cases")
async def get_batch_test_cases():
    """Get all test cases from all_test_cases.json as an array."""
    try:
        test_cases_path = EVAL_KIT_DIR / "sample_data" / "all_test_cases.json"

        if not test_cases_path.exists():
            return []

        with open(test_cases_path, "r") as f:
            test_cases = json.load(f)

        # Ensure it's a list
        if not isinstance(test_cases, list):
            logger.error("all_test_cases.json is not a list")
            return []

        return test_cases

    except Exception as e:
        logger.error(f"Error loading batch test cases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch/save-run")
async def save_batch_run(results: dict):
    """
    Save batch test run results to a timestamped JSON file.

    Args:
        results: Dictionary containing the batch run results

    Returns:
        filename: Name of the saved file
        success: Boolean indicating success
    """
    try:
        # Generate timestamp filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"batch_run_{timestamp}.json"

        # Create runs directory if it doesn't exist
        runs_dir = EVAL_KIT_DIR / "batch_runner" / "runs"
        runs_dir.mkdir(parents=True, exist_ok=True)

        # Full file path
        file_path = runs_dir / filename

        # Save the results to JSON file
        with open(file_path, "w") as f:
            json.dump(results, f, indent=2)

        logger.info(f"Batch run saved successfully to {filename}")

        return {"success": True, "filename": filename, "path": str(file_path)}

    except Exception as e:
        logger.error(f"Error saving batch run: {e}")
        raise HTTPException(status_code=500, detail=str(e))
