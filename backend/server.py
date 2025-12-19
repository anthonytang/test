"""FastAPI server for document processing and template generation."""

import os
import re
import time
import tempfile
import json
import logging
import uvicorn
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any
from io import BytesIO
from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from uuid import UUID, uuid4
from sse_starlette import EventSourceResponse
import tiktoken
import xlsxwriter
import base64

from pipeline import Pipeline, get_parse, Context
from clients import get_cosmos_client, get_storage_client
from ai import get_agent, OutputFormat, Agent
from templates import TemplateExtractor
from external import External
from conversational import Conversational
from core.config import (
    CORS_ORIGINS,
    COSMOS_MONGODB_CONNECTION_STRING,
    COSMOS_DATABASE_NAME,
    COSMOS_COLLECTION_NAME,
    EMBEDDING_MODEL_NAME,
    FILE_PROCESSING_CONCURRENCY,
    FIELD_PROCESSING_CONCURRENCY,
    URL_CRAWL_CONCURRENCY,
    COLOR_SCHEMES,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("server")
logging.getLogger("httpx").setLevel(logging.WARNING)


def decode_jwt_payload(token: str) -> Dict[str, Any]:
    """
    Decode a JWT payload without verifying the signature.
    This is safe here because APIM has already validated the token.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise HTTPException(status_code=401, detail="Invalid token format")

        payload_encoded = parts[1]
        padding = "=" * (-len(payload_encoded) % 4)  # 0–3 '=' chars
        payload_bytes = base64.urlsafe_b64decode(payload_encoded + padding)
        return json.loads(payload_bytes.decode("utf-8"))
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Failed to decode JWT payload: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")


def extract_user_from_token(token: str) -> Dict[str, str]:
    payload = decode_jwt_payload(token)
    user_id = payload.get("oid") or payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="No user ID found in token")

    user_email = (
        payload.get("preferred_username")
        or payload.get("upn")
        or payload.get("email")
        or payload.get("name")
        or "unknown"
    )

    return {"user_id": user_id, "user_email": user_email}


def get_user_from_auth_header(req: Request) -> Dict[str, str]:
    auth_header = req.headers.get("Authorization") or req.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization required")

    token = auth_header.split(" ", 1)[1]
    return extract_user_from_token(token)


def build_conversational_response(data: Any, user_id: str) -> Dict[str, Any]:
    """Build standardized response for conversational endpoints."""
    return {
        "success": True,
        "data": data,
        "metadata": {
            "user_id": str(user_id),
            "timestamp": time.time(),
        },
    }


# =============================================================================
# Service Clients
# =============================================================================
pipeline = Pipeline()
cosmos_client = get_cosmos_client()
parse = get_parse()
azure_storage_client = get_storage_client()
agent = get_agent()
conversational = Conversational()
external = External()

# =============================================================================
# Concurrency Semaphores
# =============================================================================
processing_semaphore = asyncio.Semaphore(FILE_PROCESSING_CONCURRENCY)
field_processing_semaphore = asyncio.Semaphore(FIELD_PROCESSING_CONCURRENCY)
url_crawl_semaphore = asyncio.Semaphore(URL_CRAWL_CONCURRENCY)

# =============================================================================
# State Management
# =============================================================================
field_processing_state: dict[str, Any] = {}
template_generation_state: dict[str, dict] = {}  # {gen_id: {"cancelled": bool}}


class DependentFieldResult(BaseModel):
    field_id: str
    field_name: str
    field_type: str
    response: str


class ProcessRequest(BaseModel):
    field_name: str
    field_description: str
    file_ids: List[UUID]  # Accept any valid UUID, not just UUID4
    project_metadata: Dict
    template_metadata: Dict
    output_format: OutputFormat
    execution_mode: Optional[str] = "both"  # "both" | "response_only" | "analysis_only"
    dependent_field_results: Optional[List[DependentFieldResult]] = None


class ConversationalTemplateRequest(BaseModel):
    description: str
    project_name: Optional[str] = None
    project_description: Optional[str] = None
    project_metadata: Optional[Dict] = None


class ConversationalRefineRequest(BaseModel):
    current_description: str
    field_name: str
    field_type: str
    user_feedback: str


class SearchRequest(BaseModel):
    query: str
    max_results: Optional[int] = 10


class CrawlUrlsRequest(BaseModel):
    urls: List[str]
    project_id: str


class ConversationalProjectRequest(BaseModel):
    description: str


class ChartExportRequest(BaseModel):
    field_name: str
    field_id: str
    chart_type: str  # 'bar', 'line', 'pie', 'area'
    chart_config: Dict[str, Any]  # xAxis, yAxes, colorScheme
    table_data: Dict[str, Any]  # rows with cells
    advanced_settings: Optional[Dict[str, Any]] = None


app = FastAPI()

allowed_origins = [
    "http://localhost:3000",  # Development
]

if CORS_ORIGINS:
    allowed_origins.extend(CORS_ORIGINS.split(","))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


@app.get("/health")
@app.head("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": time.time()}


@app.get("/debug/cosmos")
async def debug_cosmos(req: Request):
    """
    Diagnostic endpoint to check Cosmos DB connection and vector index status.
    Use this to debug "No chunks retrieved" errors on new deployments.
    """
    try:
        user = get_user_from_auth_header(req)
        user_id = user["user_id"]
        logger.info(f"AUDIT: User {user_id} accessed /debug/cosmos")
    except Exception:
        # Allow unauthenticated access for initial debugging
        pass

    diagnostics: Dict[str, Any] = {
        "timestamp": time.time(),
        "status": "checking",
        "checks": {}
    }

    # 1. Check environment variables (from config)
    env_checks = {
        "COSMOS_MONGODB_CONNECTION_STRING": bool(COSMOS_MONGODB_CONNECTION_STRING),
        "COSMOS_DATABASE_NAME": COSMOS_DATABASE_NAME,
        "COSMOS_COLLECTION_NAME": COSMOS_COLLECTION_NAME,
        "EMBEDDING_MODEL_NAME": EMBEDDING_MODEL_NAME or "NOT SET",
    }
    diagnostics["checks"]["environment"] = env_checks

    # 2. Check Cosmos connection
    try:
        # Try to get collection stats
        stats = cosmos_client.collection.estimated_document_count()
        diagnostics["checks"]["cosmos_connection"] = {
            "status": "connected",
            "database": cosmos_client.database_name,
            "collection": cosmos_client.collection_name,
            "document_count": stats
        }
    except Exception as e:
        diagnostics["checks"]["cosmos_connection"] = {
            "status": "failed",
            "error": str(e)
        }
        diagnostics["status"] = "error"
        return diagnostics

    # 3. Check vector index exists
    try:
        indexes = list(cosmos_client.collection.list_indexes())
        index_names = [idx.get("name", "unknown") for idx in indexes]
        has_vector_index = any("vector" in name.lower() or "cosmosSearch" in str(idx) for name, idx in zip(index_names, indexes))

        diagnostics["checks"]["indexes"] = {
            "status": "ok" if has_vector_index else "warning",
            "index_names": index_names,
            "has_vector_index": has_vector_index,
            "warning": None if has_vector_index else "Vector index may not be configured. Create it via Azure Portal."
        }
    except Exception as e:
        diagnostics["checks"]["indexes"] = {
            "status": "error",
            "error": str(e)
        }

    # 4. Sample documents to verify structure
    try:
        sample_docs = list(cosmos_client.collection.find({}).limit(3))
        if sample_docs:
            sample_info = []
            for doc in sample_docs:
                sample_info.append({
                    "id": str(doc.get("_id", "?")),
                    "file_id": doc.get("file_id", "MISSING"),
                    "file_name": doc.get("file_name", "MISSING"),
                    "has_embedding": "embedding" in doc and len(doc.get("embedding", [])) > 0,
                    "user_id": doc.get("user_id", "MISSING")
                })
            diagnostics["checks"]["sample_documents"] = {
                "status": "ok",
                "count": len(sample_docs),
                "samples": sample_info
            }
        else:
            diagnostics["checks"]["sample_documents"] = {
                "status": "warning",
                "count": 0,
                "message": "No documents found in collection. Files need to be uploaded and processed first."
            }
    except Exception as e:
        diagnostics["checks"]["sample_documents"] = {
            "status": "error",
            "error": str(e)
        }

    # 5. Test embedding generation
    try:
        test_embedding = await cosmos_client.get_embeddings("test query")
        diagnostics["checks"]["embedding_service"] = {
            "status": "ok",
            "embedding_dimensions": len(test_embedding) if test_embedding else 0
        }
    except Exception as e:
        diagnostics["checks"]["embedding_service"] = {
            "status": "error",
            "error": str(e)
        }
        diagnostics["status"] = "error"

    # Final status
    if diagnostics["status"] != "error":
        all_ok = all(
            check.get("status") in ["ok", "connected"]
            for check in diagnostics["checks"].values()
        )
        diagnostics["status"] = "healthy" if all_ok else "degraded"

    return diagnostics


@app.get("/debug/file/{file_id}")
async def debug_file_chunks(file_id: str, req: Request):
    """
    Check if a specific file has been indexed in Cosmos DB.
    Use this to verify file processing completed successfully.
    """
    try:
        user = get_user_from_auth_header(req)
        user_id = user["user_id"]
        logger.info(f"AUDIT: User {user_id} accessed /debug/file/{file_id}")
    except Exception:
        pass

    try:
        # Count chunks for this file
        chunk_count = cosmos_client.collection.count_documents({"file_id": file_id})

        # Get sample chunks
        sample_chunks = list(cosmos_client.collection.find(
            {"file_id": file_id},
            {"_id": 1, "file_name": 1, "chunk_index": 1, "start_line": 1, "user_id": 1}
        ).limit(5))

        return {
            "file_id": file_id,
            "indexed": chunk_count > 0,
            "chunk_count": chunk_count,
            "sample_chunks": [
                {
                    "id": str(c.get("_id")),
                    "file_name": c.get("file_name"),
                    "chunk_index": c.get("chunk_index"),
                    "start_line": c.get("start_line"),
                    "user_id": c.get("user_id")
                }
                for c in sample_chunks
            ],
            "message": "File is indexed and ready for search" if chunk_count > 0 else "File NOT found in vector database. Re-upload or re-process the file."
        }
    except Exception as e:
        return {
            "file_id": file_id,
            "indexed": False,
            "error": str(e)
        }


@app.post("/export-chart-excel")
async def export_chart_excel(request: ChartExportRequest, req: Request):
    """
    Generate Excel file with native chart using xlsxwriter
    Returns binary Excel file with embedded native chart
    """
    try:
        # Auth + user
        user = get_user_from_auth_header(req)
        user_id = user["user_id"]
        user_email = user["user_email"]

        logger.info(
            "AUDIT: User %s (%s) exported chart. FieldId=%s, FieldName=%s, ChartType=%s",
            user_email,
            user_id,
            request.field_id,
            request.field_name,
            request.chart_type,
        )
        logger.info(f"Exporting chart for field: {request.field_name}")

        # Create Excel file in memory
        output = BytesIO()
        workbook = xlsxwriter.Workbook(output, {"in_memory": True})
        worksheet = workbook.add_worksheet("Chart Data")

        # Parse table data
        rows = request.table_data.get("rows", [])
        if not rows or len(rows) < 2:
            raise HTTPException(
                status_code=400, detail="Insufficient table data for chart"
            )

        header_row = rows[0]
        data_rows = rows[1:]

        # Get headers from first row
        headers = [cell.get("text", "") for cell in header_row.get("cells", [])]

        # Write title
        title_format = workbook.add_format({"bold": True, "font_size": 14})
        worksheet.write(0, 0, request.field_name, title_format)

        # Write table data starting at row 2
        header_format = workbook.add_format(
            {"bold": True, "bg_color": "#F0F0F0", "border": 1}
        )
        data_format = workbook.add_format({"border": 1})

        # Header row at row 2
        for col_idx, header in enumerate(headers):
            worksheet.write(2, col_idx, header, header_format)

        # Data rows starting at row 3
        for row_idx, row in enumerate(data_rows):
            cells = row.get("cells", [])
            for col_idx, cell in enumerate(cells):
                text = cell.get("text", "")
                try:
                    cleaned = (
                        text.replace("$", "")
                        .replace(",", "")
                        .replace("%", "")
                        .strip()
                    )
                    value = float(cleaned)
                    worksheet.write(3 + row_idx, col_idx, value, data_format)
                except (ValueError, AttributeError):
                    worksheet.write(3 + row_idx, col_idx, text, data_format)

        # Set column widths
        for col_idx in range(len(headers)):
            worksheet.set_column(col_idx, col_idx, 15)

        # Get chart configuration
        chart_config = request.chart_config

        chart_type_map = {
            "bar": "column",
            "line": "line",
            "pie": "pie",
            "area": "area",
        }
        excel_chart_type = chart_type_map.get(request.chart_type, "column")

        chart = workbook.add_chart({"type": excel_chart_type})

        # Extract x-axis and y-axes from config
        x_axis = chart_config.get("xAxis", "")
        y_axes = chart_config.get("yAxes", [])

        try:
            x_col = headers.index(x_axis)
        except ValueError:
            x_col = 0

        color_scheme_name = "default"
        if request.advanced_settings:
            color_scheme_name = request.advanced_settings.get("colorScheme", "default")
        colors = COLOR_SCHEMES.get(color_scheme_name, COLOR_SCHEMES["default"])

        # Add series for each y-axis
        for idx, y_axis in enumerate(y_axes):
            try:
                y_col = headers.index(y_axis)
                x_col_letter = Context._col_to_excel(x_col)
                y_col_letter = Context._col_to_excel(y_col)
                series_color = colors[idx % len(colors)].replace("#", "")

                series_config: Dict[str, Any] = {
                    "name": f"='Chart Data'!${y_col_letter}$3",
                    "categories": (
                        f"='Chart Data'!${x_col_letter}$4:"
                        f"${x_col_letter}${4 + len(data_rows) - 1}"
                    ),
                    "values": (
                        f"='Chart Data'!${y_col_letter}$4:"
                        f"${y_col_letter}${4 + len(data_rows) - 1}"
                    ),
                }

                if excel_chart_type == "pie":
                    points = []
                    for i in range(len(data_rows)):
                        point_color = colors[i % len(colors)].replace("#", "")
                        points.append({"fill": {"color": point_color}})
                    series_config["points"] = points
                else:
                    if excel_chart_type == "line":
                        series_config["line"] = {"color": series_color, "width": 2}
                    else:
                        series_config["fill"] = {"color": series_color}

                chart.add_series(series_config)
            except ValueError:
                continue

        chart.set_title({"name": request.field_name})
        chart.set_x_axis({"name": x_axis})
        chart.set_style(10)

        chart_row = 3 + len(data_rows) + 2
        worksheet.insert_chart(chart_row, 0, chart, {"x_scale": 1.5, "y_scale": 1.5})

        workbook.close()
        output.seek(0)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"chart-{request.field_id}-{timestamp}.xlsx"

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting chart: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to export chart: {str(e)}"
        )


@app.post("/generate-template")
async def generate_template(request: ConversationalTemplateRequest, req: Request):
    """Generate a template from natural language description"""
    try:
        user = get_user_from_auth_header(req)
        user_id = user["user_id"]
        user_email = user["user_email"]

        logger.info(
            "AUDIT: User %s (%s) requested template generation",
            user_email,
            user_id,
        )

        template_data = await conversational.parse_template_request(
            user_input=request.description,
            project_name=request.project_name,
            project_description=request.project_description,
            project_metadata=request.project_metadata,
        )

        logger.info(
            "Successfully generated template (user: %s)",
            user_id,
        )

        return build_conversational_response(template_data, user_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error generating template: {str(e)}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate template: {str(e)}",
        )


@app.post("/conversational/create-project")
async def create_project_conversational(request: ConversationalProjectRequest, req: Request):
    """Create a project from natural language description"""
    try:
        user = get_user_from_auth_header(req)
        user_id = user["user_id"]
        user_email = user["user_email"]

        logger.info(
            "AUDIT: User %s (%s) requested conversational project creation",
            user_email,
            user_id,
        )

        project_data = await conversational.parse_project_request(
            user_input=request.description,
        )

        logger.info(
            "Successfully created project: %s for user %s",
            project_data["name"],
            user_id,
        )

        return build_conversational_response(project_data, user_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error creating project: {str(e)}", exc_info=True
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to create project: {str(e)}"
        )


@app.post("/search-urls")
async def search_urls(request: SearchRequest, req: Request):
    """Search for URLs using Perplexity"""
    try:
        user = get_user_from_auth_header(req)
        user_id = user["user_id"]
        user_email = user["user_email"]

        logger.info(
            "AUDIT: User %s (%s) searched URLs. Query='%s'",
            user_email,
            user_id,
            request.query,
        )

        results = await asyncio.to_thread(
            external.search,
            query=request.query,
            max_results=request.max_results or 10,
        )

        logger.info("Search returned %d URLs for user %s", len(results), user_id)

        return {
            "success": True,
            "query": request.query,
            "results": results,
            "results_count": len(results),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching URLs: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to search URLs: {str(e)}"
        )


@app.post("/crawl-urls")
async def crawl_urls(request: CrawlUrlsRequest, req: Request):
    """
    Scrape URLs using Firecrawl batch API and store in project.

    Uses batch scraping for parallel URL fetching, then processes
    results with a semaphore to limit concurrent DB/embedding operations.
    """
    total_start = time.time()
    user = get_user_from_auth_header(req)
    user_id = user["user_id"]
    user_email = user["user_email"]

    logger.info(
        "AUDIT: User %s (%s) started URL crawl. ProjectId=%s, UrlCount=%d",
        user_email,
        user_id,
        request.project_id,
        len(request.urls),
    )

    if not request.urls:
        raise HTTPException(status_code=400, detail="No URLs provided")

    # Step 1: Batch scrape all URLs
    t0 = time.time()
    scraped_results = await asyncio.to_thread(external.batch_scrape, request.urls)
    logger.info(f"[TIMING] batch_scrape_total: {time.time() - t0:.3f}s for {len(request.urls)} URLs")

    # Step 2: Process results with concurrency limit
    async def process_with_semaphore(content: dict) -> dict:
        async with url_crawl_semaphore:
            return await external.process_scraped_content(
                content=content,
                project_id=request.project_id,
                user_id=user_id
            )

    t0 = time.time()
    results = await asyncio.gather(*[
        process_with_semaphore(content) for content in scraped_results
    ])
    logger.info(f"[TIMING] process_all: {time.time() - t0:.3f}s")

    # Count results
    urls_completed = sum(1 for r in results if r.get("status") == "success")
    urls_failed = len(results) - urls_completed

    logger.info(
        f"[TIMING] crawl_total: {time.time() - total_start:.3f}s for {len(request.urls)} "
        f"URLs ({urls_completed} success, {urls_failed} failed)"
    )

    return {
        "success": True,
        "urls_total": len(request.urls),
        "urls_completed": urls_completed,
        "urls_failed": urls_failed,
        "results": results,
    }


@app.post("/enhance-field-description")
async def enhance_field_description(request: ConversationalRefineRequest, req: Request):
    """Refine a field description based on user feedback"""
    try:
        user = get_user_from_auth_header(req)
        user_id = user["user_id"]
        user_email = user["user_email"]

        logger.info(
            "AUDIT: User %s (%s) requested field description refinement. FieldName=%s, FieldType=%s",
            user_email,
            user_id,
            request.field_name,
            request.field_type,
        )

        # Map field_* to section_* for internal agent call
        enhanced_description = await conversational.refine_section_description(
            current_description=request.current_description,
            section_name=request.field_name,
            section_type=request.field_type,
            user_feedback=request.user_feedback,
        )

        logger.info(
            "Successfully refined field description for user: %s", user_id
        )

        result_data = {
            "original_field_description": request.current_description,
            "enhanced_field_description": enhanced_description,
        }

        return build_conversational_response(result_data, user_id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refining field description: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to refine field description: {str(e)}",
        )


async def process_field_with_events(field_id: str, request_data: dict, req: Request):
    """Process field and yield SSE events for progress"""
    # Store processing_id to check in finally block (prevents race condition with new runs)
    processing_id = request_data.get("processing_id")
    try:
        logger.info(f"[SSE] Starting field processing for field_id: {field_id}")

        user_id = request_data.get("user_id", "unknown")
        user_email = request_data.get("user_email", "unknown")
        logger.info(
            "AUDIT: User %s (%s) started SSE field processing stream. FieldId=%s",
            user_email,
            user_id,
            field_id,
        )

        # Check if already cancelled before starting
        if request_data.get("cancelled"):
            logger.info(f"[SSE] Field {field_id} already cancelled before starting")
            yield {
                "event": "cancelled",
                "data": json.dumps({
                    "fieldId": field_id,
                    "fieldName": request_data.get("field_name", ""),
                    "message": "Cancelled",
                }),
            }
            return

        if await req.is_disconnected():
            return

        progress_queue: asyncio.Queue[dict] = asyncio.Queue()

        async def progress_callback(progress_data):
            if await req.is_disconnected():
                return False

            await progress_queue.put(
                {
                    "event": "progress",
                    "data": json.dumps(
                        {
                            "fieldId": field_id,
                            "fieldName": request_data.get("field_name", ""),
                            **progress_data,
                            "timestamp": time.time(),
                        }
                    ),
                }
            )
            return True

        user_id = request_data["user_id"]
        file_ids = request_data["file_ids"]
        # Map field_* from request to section_* for internal pipeline call
        section_name = request_data["field_name"]
        section_description = request_data["field_description"]
        template_description = request_data.get("template_description", "")
        project_description = request_data.get("project_description", "")
        output_format = request_data["output_format"]
        execution_mode = request_data.get("execution_mode", "both")
        dependent_section_results = request_data.get("dependent_section_results", None)

        pipeline_task = asyncio.create_task(
            pipeline.run_with_progress(
                section_id=field_id,
                file_ids=file_ids,
                section_name=section_name,
                section_description=section_description,
                template_description=template_description,
                project_description=project_description,
                output_format=output_format,
                execution_mode=execution_mode,
                dependent_section_results=dependent_section_results,
                progress_callback=progress_callback,
            )
        )

        field_processing_state[field_id]["task"] = pipeline_task

        while True:
            if request_data.get("cancelled"):
                logger.info(
                    f"[SSE] Field {field_id} cancellation detected - cancelling task"
                )
                if not pipeline_task.done():
                    pipeline_task.cancel()
                    try:
                        await asyncio.wait_for(pipeline_task, timeout=0.5)
                    except (asyncio.CancelledError, asyncio.TimeoutError):
                        pass
                yield {
                    "event": "cancelled",
                    "data": json.dumps(
                        {
                            "fieldId": field_id,
                            "fieldName": request_data.get("field_name", ""),
                            "stage": "cancelled",
                            "progress": 0,
                            "message": "Cancelled",
                            "timestamp": time.time(),
                        }
                    ),
                }
                break

            if pipeline_task.done():
                try:
                    result = await pipeline_task

                    yield {
                        "event": "completed",
                        "data": json.dumps(
                            {
                                "fieldId": field_id,
                                "fieldName": request_data.get("field_name", ""),
                                "stage": "completed",
                                "progress": 100,
                                "message": "Complete",
                                "timestamp": time.time(),
                                "results": result,
                            }
                        ),
                    }
                    break
                except asyncio.CancelledError:
                    logger.info(f"[SSE] Field {field_id} task cancelled")
                    yield {
                        "event": "cancelled",
                        "data": json.dumps(
                            {
                                "fieldId": field_id,
                                "fieldName": request_data.get("field_name", ""),
                                "stage": "cancelled",
                                "progress": 0,
                                "message": "Cancelled",
                                "timestamp": time.time(),
                            }
                        ),
                    }
                    break
                except Exception as e:
                    raise e

            try:
                event = await asyncio.wait_for(progress_queue.get(), timeout=0.1)
                yield event
            except asyncio.TimeoutError:
                continue

    except Exception as e:
        if "cancelled by user" in str(e).lower():
            logger.info(f"[SSE] Field {field_id} cancelled by user")
            yield {
                "event": "cancelled",
                "data": json.dumps(
                    {
                        "fieldId": field_id,
                        "fieldName": request_data.get("field_name", ""),
                        "stage": "cancelled",
                        "progress": 0,
                        "message": "Cancelled",
                        "timestamp": time.time(),
                    }
                ),
            }
        else:
            logger.error(f"[SSE] Error processing field {field_id}: {str(e)}")
            yield {
                "event": "error",
                "data": json.dumps(
                    {
                        "fieldId": field_id,
                        "stage": "error",
                        "progress": 0,
                        "message": "Failed",
                        "error": str(e),
                        "timestamp": time.time(),
                    }
                ),
            }
    finally:
        if "pipeline_task" in locals() and not pipeline_task.done():
            logger.info(
                f"[SSE] Cleaning up - cancelling pipeline task for field {field_id}"
            )
            pipeline_task.cancel()
            try:
                await pipeline_task
            except asyncio.CancelledError:
                pass
        # Only cleanup state if this is still our session (prevents race condition with new runs)
        current_state = field_processing_state.get(field_id)
        if current_state and current_state.get("processing_id") == processing_id:
            field_processing_state.pop(field_id, None)
            logger.info(f"[SSE] Cleanup complete for field {field_id}")
        else:
            logger.info(f"[SSE] Skipping cleanup for field {field_id} - newer session started")


@app.get("/process/field/{field_id}/stream")
async def process_field_stream(
    field_id: str, request: Request, token: Optional[str] = None
):
    """
    Stream field processing progress with SSE.
    Accepts token as query parameter for EventSource compatibility.
    """
    if not token:
        raise HTTPException(status_code=403, detail="Authentication token required")

    # Decode user for audit (no strict owner check here, APIM already validated)
    user = extract_user_from_token(token)
    user_id = user["user_id"]
    user_email = user["user_email"]

    request_data = field_processing_state.get(field_id)
    if not request_data:
        raise HTTPException(status_code=404, detail="Field processing request not found")

    logger.info(
        "AUDIT: User %s (%s) opened field SSE stream. FieldId=%s",
        user_email,
        user_id,
        field_id,
    )

    async def process_with_limits():
        async with field_processing_semaphore:
            try:
                async with asyncio.timeout(300):
                    async for event in process_field_with_events(
                        field_id, request_data, request
                    ):
                        yield event
            except asyncio.TimeoutError:
                logger.error(f"Processing timeout for field {field_id}")
                yield {
                    "event": "error",
                    "data": json.dumps(
                        {
                            "fieldId": field_id,
                            "error": "Processing timeout - field processing took too long",
                            "timestamp": time.time(),
                        }
                    ),
                }

    return EventSourceResponse(process_with_limits())


@app.post("/process/field/{field_id}/start")
async def start_field_processing(field_id: str, req: Request):
    """Initialize field processing and store request data"""
    try:
        body = await req.json()
        request = ProcessRequest(**body)

        user = get_user_from_auth_header(req)
        user_id = user["user_id"]
        user_email = user["user_email"]

        project_desc = (
            request.project_metadata.get("description", "")
            if request.project_metadata
            else ""
        )

        # Generate unique processing ID to prevent race conditions
        processing_id = str(uuid4())

        # Clean up stale entries (no task, >5 min old)
        old_state = field_processing_state.get(field_id)
        if old_state and not old_state.get("task"):
            age = time.time() - old_state.get("timestamp", 0)
            if age > 300:
                field_processing_state.pop(field_id, None)
                logger.info(f"Cleaned up stale state for field {field_id} (age: {age:.1f}s)")

        # Store with field_* keys for external consistency
        field_processing_state[field_id] = {
            "field_id": field_id,
            "processing_id": processing_id,
            "user_id": user_id,
            "user_email": user_email,
            "file_ids": [str(fid) for fid in request.file_ids],
            "field_name": request.field_name,
            "field_description": request.field_description,
            "template_description": (
                request.template_metadata.get("description", "")
                if request.template_metadata
                else ""
            ),
            "project_description": project_desc,
            "output_format": request.output_format,
            "execution_mode": request.execution_mode,
            "dependent_section_results": (
                [
                    {
                        "section_id": dep.field_id,
                        "section_name": dep.field_name,
                        "section_type": dep.field_type,
                        "response": dep.response,
                    }
                    for dep in request.dependent_field_results
                ]
                if request.dependent_field_results
                else None
            ),
            "cancelled": False,
            "timestamp": time.time(),
        }

        logger.info(
            "AUDIT: User %s (%s) started field processing. "
            "FieldId=%s, ExecutionMode=%s, Files=%s",
            user_email,
            user_id,
            field_id,
            request.execution_mode,
            request.file_ids,
        )

        logger.info(f"Field processing initialized for field_id: {field_id}")

        return {
            "fieldId": field_id,
            "processingId": processing_id,
            "message": "Section processing initialized",
            "streamUrl": f"/process/field/{field_id}/stream",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error initializing field processing: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initialize field processing: {str(e)}",
        )


class AbortRequest(BaseModel):
    processing_id: str


@app.post("/process/field/{field_id}/abort")
async def abort_field_processing(field_id: str, req: Request):
    """Abort field processing"""
    user = get_user_from_auth_header(req)
    user_id = user["user_id"]
    user_email = user["user_email"]

    body = await req.json()
    abort_request = AbortRequest(**body)
    processing_id = abort_request.processing_id

    logger.info(
        "AUDIT: User %s (%s) requested abort for field processing. FieldId=%s, ProcessingId=%s",
        user_email,
        user_id,
        field_id,
        processing_id,
    )

    if field_id in field_processing_state:
        current_state = field_processing_state[field_id]

        # Validate user ownership
        if current_state.get("user_id") != user_id:
            logger.warning(
                f"Abort denied for field {field_id} - user {user_id} does not own this processing session"
            )
            raise HTTPException(status_code=403, detail="Access denied")

        # Only cancel if processing_id matches
        if current_state.get("processing_id") != processing_id:
            logger.info(
                f"Abort skipped for field {field_id} - processing_id mismatch"
            )
            return {"success": False, "message": "Processing session no longer active"}

        current_state["cancelled"] = True

        task = current_state.get("task")
        if task and not task.done():
            task.cancel()
            logger.info(f"Cancelled running task for field {field_id}")
        else:
            logger.info(
                f"Marked field {field_id} for cancellation (task not started or already done)"
            )

        return {"success": True, "message": "Section processing aborted"}

    return {"success": False, "message": "No active processing found for section"}


async def process_file_with_events(user_id: str, file_id: str, request: Request):
    """Process file and yield SSE events for progress"""
    try:
        logger.info(f"[SSE] Starting processing generator for file {file_id}")
        await azure_storage_client.update_processing_status(file_id, "processing")

        yield {"event": "progress", "data": json.dumps({"file_id": file_id, "progress": 0, "message": "Downloading"})}

        file_info = await azure_storage_client.get_file_info(file_id)
        if not file_info:
            raise HTTPException(status_code=404, detail=f"File {file_id} not found")

        if await request.is_disconnected():
            return

        file_content = await azure_storage_client.download_file(file_info["file_path"])

        with tempfile.NamedTemporaryFile(
            delete=False, suffix=os.path.splitext(file_info["file_name"])[1]
        ) as temp_file:
            temp_file.write(file_content)
            temp_path = temp_file.name

        try:
            yield {"event": "progress", "data": json.dumps({"file_id": file_id, "progress": 20, "message": "Parsing"})}

            if await request.is_disconnected():
                return

            page_data, intake_content = await parse.parse_document(
                temp_path, file_info["file_name"]
            )

            yield {"event": "progress", "data": json.dumps({"file_id": file_id, "progress": 45, "message": "Analyzing"})}

            if await request.is_disconnected():
                return

            document_metadata = await parse.analyze_document_metadata(
                intake_content, file_info["file_name"]
            )
            doc_structure = parse.build_chunks(page_data, temp_path)

            yield {"event": "progress", "data": json.dumps({"file_id": file_id, "progress": 65, "message": "Indexing"})}

            if await request.is_disconnected():
                return

            await cosmos_client.batch_upsert_documents(
                doc_structure["chunks"], file_id, file_info["file_name"], user_id, document_metadata
            )

            try:
                success = await azure_storage_client.update_file_processing_results(
                    file_id,
                    document_metadata,
                    doc_structure["file_map"],
                    doc_structure["page_map"],
                    doc_structure["excel_file_map"],
                    doc_structure["sheet_map"],
                    doc_structure["full_excel_sheets"],
                )

                if not success:
                    raise Exception("Failed to update file processing results")

                await azure_storage_client.update_processing_status(file_id, "completed")
            except Exception as db_error:
                logger.error(f"DB update failed after vector upsert, cleaning up: {db_error}")
                try:
                    await cosmos_client.delete_document(file_id, user_id)
                except Exception:
                    pass
                raise

            yield {"event": "completed", "data": json.dumps({"file_id": file_id, "progress": 100, "message": "Done"})}

        finally:
            if os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass

    except asyncio.CancelledError:
        raise
    except Exception as e:
        try:
            await azure_storage_client.update_processing_status(file_id, "failed")
        except Exception:
            pass

        yield {
            "event": "error",
            "data": json.dumps(
                {
                    "file_id": file_id,
                    "error": str(e),
                    "timestamp": time.time(),
                }
            ),
        }


@app.get("/users/{user_id}/files/{file_id}/process/stream")
async def process_file_stream(
    user_id: str, file_id: str, request: Request, token: Optional[str] = None
):
    """
    Stream file processing progress with SSE.
    Accepts token as query parameter for EventSource compatibility.
    """
    if not token:
        raise HTTPException(status_code=403, detail="Authentication token required")

    user = extract_user_from_token(token)
    token_user_id = user["user_id"]
    user_email = user["user_email"]

    # Optional: enforce ownership
    if token_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: token user does not match path user",
        )

    logger.info(
        "AUDIT: User %s (%s) opened file SSE stream. UserId=%s, FileId=%s",
        user_email,
        token_user_id,
        user_id,
        file_id,
    )

    async def process_with_limits():
        async with processing_semaphore:
            try:
                async with asyncio.timeout(600):
                    async for event in process_file_with_events(
                        user_id, file_id, request
                    ):
                        yield event
            except asyncio.TimeoutError:
                logger.error(f"Processing timeout for file {file_id}")
                yield {
                    "event": "error",
                    "data": json.dumps(
                        {
                            "file_id": file_id,
                            "error": "Processing timeout - file too large or complex",
                            "timestamp": time.time(),
                        }
                    ),
                }
                try:
                    await azure_storage_client.update_processing_status(
                        file_id, "failed"
                    )
                except Exception:
                    pass

    return EventSourceResponse(process_with_limits())


@app.post("/users/{user_id}/files/{file_id}/abort-template")
async def abort_template_generation(user_id: str, file_id: str, req: Request):
    """Abort template generation for a file"""
    user_info = get_user_from_auth_header(req)
    token_user_id = user_info["user_id"]
    user_email = user_info["user_email"]

    if token_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: Cannot cancel another user's template generation",
        )

    logger.info(
        "AUDIT: User %s (%s) requested template generation abort. UserId=%s, FileId=%s",
        user_email,
        token_user_id,
        user_id,
        file_id,
    )

    cancelled_count = 0
    for gen_id in list(template_generation_state.keys()):
        if gen_id.startswith(f"{user_id}_{file_id}_"):
            template_generation_state[gen_id]["cancelled"] = True
            cancelled_count += 1
            logger.info(
                "[TEMPLATE GEN] Marked generation %s for cancellation", gen_id
            )

    if cancelled_count > 0:
        return {
            "success": True,
            "message": f"Template generation cancelled ({cancelled_count} active)",
        }
    else:
        return {
            "success": True,
            "message": "No active template generation to cancel",
        }


@app.post("/users/{user_id}/files/{file_id}/abort")
async def abort_processing(user_id: str, file_id: str, req: Request):
    """Immediately abort file processing"""
    user_info = get_user_from_auth_header(req)
    token_user_id = user_info["user_id"]
    user_email = user_info["user_email"]

    if token_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: Cannot abort another user's processing",
        )

    logger.info(
        "AUDIT: User %s (%s) requested file processing abort. UserId=%s, FileId=%s",
        user_email,
        token_user_id,
        user_id,
        file_id,
    )

    try:
        await azure_storage_client.update_processing_status(file_id, "cancelled")
        return {"success": True, "message": "Processing aborted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error aborting processing for file {file_id}: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to abort processing: {str(e)}",
        }


@app.delete("/users/{user_id}/files/{file_id}")
async def delete_user_file(user_id: str, file_id: str, req: Request):
    """Delete vectors for a user file from vector database"""
    user_info = get_user_from_auth_header(req)
    token_user_id = user_info["user_id"]
    user_email = user_info["user_email"]

    if token_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: Cannot delete another user's files",
        )

    try:
        logger.info(
            "AUDIT: User %s (%s) deleted file vectors. FileId=%s",
            user_email,
            token_user_id,
            file_id,
        )

        await cosmos_client.delete_document(document_id=file_id, namespace=user_id)

        return {
            "success": True,
            "message": "File vectors deleted successfully",
            "file_id": file_id,
            "user_id": user_id,
            "timestamp": time.time(),
        }
    except Exception as e:
        logger.error(
            f"Error deleting vectors for file {file_id}: {str(e)}", exc_info=True
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to delete vectors: {str(e)}"
        )


@app.post("/users/{user_id}/files/{file_id}/generate-template")
async def generate_template_from_file(user_id: str, file_id: str, req: Request):
    """Generate a template from an uploaded document file using SSE for progress"""

    user_info = get_user_from_auth_header(req)
    token_user_id = user_info["user_id"]
    user_email = user_info["user_email"]

    if token_user_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: Cannot generate template for another user's file",
        )

    logger.info(
        "AUDIT: User %s (%s) started template generation from file. UserId=%s, FileId=%s",
        user_email,
        token_user_id,
        user_id,
        file_id,
    )

    generation_id = f"{user_id}_{file_id}_{datetime.now().isoformat()}"
    template_generation_state[generation_id] = {"cancelled": False}

    try:
        body = await req.json()
        template_name = body.get("template_name")
    except Exception:
        template_name = None

    async def generate_template_events():
        """Generator for SSE events during template generation"""
        try:
            if template_generation_state.get(generation_id, {}).get("cancelled"):
                yield {
                    "event": "cancelled",
                    "data": json.dumps({"message": "Cancelled"}),
                }
                return

            file_info = await azure_storage_client.get_file_info(file_id)
            if not file_info:
                raise HTTPException(
                    status_code=404, detail=f"File {file_id} not found"
                )

            if str(file_info["user_id"]) != user_id:
                raise HTTPException(
                    status_code=403, detail="Access denied to file"
                )

            file_content = await azure_storage_client.download_file(file_info["file_path"])

            file_name = file_info["file_name"]
            file_ext = os.path.splitext(file_name)[1] or ".pdf"

            with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
                tmp_file.write(file_content)
                tmp_file_path = tmp_file.name

            try:
                extractor = TemplateExtractor()
                async for event in extractor.generate_template_from_document(
                    tmp_file_path, template_name
                ):
                    if template_generation_state.get(generation_id, {}).get("cancelled"):
                        yield {
                            "event": "cancelled",
                            "data": json.dumps({"message": "Cancelled"}),
                        }
                        break

                    if event["event"] == "progress":
                        yield {
                            "event": "progress",
                            "data": json.dumps({
                                "progress": event["data"]["progress"],
                                "message": event["data"]["message"],
                            }),
                        }
                    elif event["event"] == "complete":
                        yield {
                            "event": "complete",
                            "data": json.dumps({
                                "progress": 100,
                                "message": "Complete",
                                "template": event["data"]["template"],
                            }),
                        }

            finally:
                if os.path.exists(tmp_file_path):
                    os.remove(tmp_file_path)

        except HTTPException as e:
            yield {
                "event": "error",
                "data": json.dumps(
                    {
                        "error": e.detail,
                        "status_code": e.status_code,
                    }
                ),
            }
        except Exception as e:
            logger.error(
                f"[TEMPLATE GEN] Error generating template from file {file_id}: {str(e)}",
                exc_info=True,
            )
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }
        finally:
            template_generation_state.pop(generation_id, None)

    return EventSourceResponse(generate_template_events())


@app.get("/playground", response_class=HTMLResponse)
async def serve_playground():
    """Serve the dev playground HTML from eval_kit folder."""
    html_path = Path(__file__).parent / "eval_kit" / "playground.html"

    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Playground HTML not found")

    with open(html_path, "r") as f:
        return HTMLResponse(content=f.read())


@app.get("/playground-new", response_class=HTMLResponse)
async def serve_playground_new():
    """Serve the new playground HTML with model selection from eval_kit folder."""
    html_path = Path(__file__).parent / "eval_kit" / "playground_new.html"

    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Playground New HTML not found")

    with open(html_path, "r") as f:
        return HTMLResponse(content=f.read())


@app.get("/tester", response_class=HTMLResponse)
async def serve_tester():
    """Serve the tester HTML for running predefined test cases."""
    html_path = Path(__file__).parent / "eval_kit" / "tester.html"

    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Tester HTML not found")

    with open(html_path, "r") as f:
        return HTMLResponse(content=f.read())


@app.get("/tester/test-cases")
async def get_test_cases():
    """List all available test case JSON files from eval_kit/sample_data."""
    try:
        sample_data_dir = Path(__file__).parent / "eval_kit" / "sample_data"

        if not sample_data_dir.exists():
            return {}

        test_cases = {}
        for json_file in sample_data_dir.glob("*.json"):
            try:
                with open(json_file, "r") as f:
                    test_case = json.load(f)
                    test_cases[json_file.name] = test_case
            except Exception as e:
                logger.error(f"Error loading test case {json_file.name}: {e}")
                continue

        return test_cases

    except Exception as e:
        logger.error(f"Error listing test cases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/tester/run")
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
        Same format as playground-new/process endpoint
    """
    try:
        from pipeline.search import Search
        from clients.openai import create_azure_client

        # Load test case JSON
        test_case_path = Path(__file__).parent / "eval_kit" / "sample_data" / test_case

        if not test_case_path.exists():
            raise HTTPException(status_code=404, detail=f"Test case not found: {test_case}")

        with open(test_case_path, "r") as f:
            test_data = json.load(f)

        # Extract test case data
        section_name = test_data.get("section_name")
        section_description = test_data.get("section_description")
        file_paths = test_data.get("file_paths", [])

        if not section_name or not section_description:
            raise HTTPException(status_code=400, detail="Test case missing section_name or section_description")

        # Processing logs
        processing_logs = []
        processing_logs.append(f"Using model: {model_name}")
        processing_logs.append(f"Output format: {output_format}")
        processing_logs.append(f"Test case: {test_data.get('test_name', test_case)}")

        # Convert output_format string to enum
        try:
            format_enum = OutputFormat(output_format.lower())
        except ValueError:
            format_enum = OutputFormat.TEXT
            processing_logs.append(f"Invalid output format '{output_format}', defaulting to TEXT")

        # Create custom Azure OpenAI client and Agent with specified model
        custom_client = create_azure_client()
        custom_agent = Agent(model=model_name, azure_client=custom_client)

        # Step 1: Generate search queries (using custom agent)
        search = Search()
        queries = await custom_agent.plan_retrieval(
            section_name=section_name,
            section_description=section_description,
            template_description=test_data.get("description", "Test case"),
            project_description="Test case evaluation",
        )
        processing_logs.append(f"Generated {len(queries)} search queries")

        # Step 2: Process files and execute search
        chunks = []
        file_ids = []

        if file_paths:
            processing_logs.append(f"Processing {len(file_paths)} file(s) from test case")

            # Get cosmos client and parse instance
            cosmos_client = get_cosmos_client()
            parse = get_parse()

            # Process each file from local filesystem
            for file_path in file_paths:
                try:
                    # Convert relative path to absolute path (relative to backend directory)
                    backend_dir = Path(__file__).parent
                    if not file_path.startswith('/'):
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
                    page_data, intake_content = await parse.parse_document(
                        str(full_path),
                        file_name
                    )

                    if not page_data:
                        processing_logs.append(f"Warning: No page data extracted from {file_name}")
                        continue

                    processing_logs.append(f"Parsed {len(page_data)} pages from {file_name}")

                    # Build chunks from page data
                    chunk_result = parse.build_chunks(page_data, str(full_path))
                    file_chunks = chunk_result["chunks"]
                    page_map = chunk_result.get("page_map", {})

                    if not file_chunks:
                        processing_logs.append(f"Warning: No chunks built from {file_name}")
                        continue

                    # Add page information to each chunk's metadata
                    for chunk in file_chunks:
                        start_line = chunk.get("start_line", 0)
                        end_line = chunk.get("end_line", start_line)

                        # Find page range
                        start_page = page_map.get(start_line, 1)
                        end_page = page_map.get(end_line, start_page)

                        chunk["metadata"] = chunk.get("metadata", {})
                        chunk["metadata"]["page_start"] = start_page
                        chunk["metadata"]["page_end"] = end_page
                        chunk["metadata"]["char_count"] = len(chunk.get("text", ""))

                    processing_logs.append(f"Created {len(file_chunks)} chunks from {file_name}")

                    # Upsert chunks to Cosmos DB with embeddings
                    await cosmos_client.batch_upsert_documents(
                        chunks=file_chunks,
                        file_id=file_id,
                        file_name=file_name,
                        namespace="tester"  # Special namespace for tester files
                    )

                    processing_logs.append(f"Stored {len(file_chunks)} chunks with embeddings in Cosmos DB")

                except Exception as e:
                    processing_logs.append(f"Error processing {file_path}: {str(e)}")
                    logger.error(f"[TESTER] Error processing file {file_path}: {e}", exc_info=True)
                    continue

            # Execute search queries if we have file IDs
            if file_ids:
                try:
                    all_chunks = await search._execute_search_queries(queries, file_ids)
                    chunks = search._deduplicate_chunks(all_chunks)
                    processing_logs.append(f"Retrieved {len(chunks)} unique chunks from search")
                except Exception as e:
                    processing_logs.append(f"Search failed: {str(e)}")
                    logger.error(f"[TESTER] Search failed: {e}", exc_info=True)
                    chunks = []
        else:
            processing_logs.append("No files specified in test case")

        # Step 3: Build context
        from pipeline.context import Context
        import tiktoken

        context_builder = Context()
        if chunks:
            context, line_map = context_builder.build(chunks, full_excel_map={})
            encoding = tiktoken.encoding_for_model("gpt-4o")
            token_count = len(encoding.encode(context))
            processing_logs.append(f"Built context with {len(line_map)} lines (~{token_count:,} tokens)")
        else:
            # Use mock context if no chunks
            context = """1. Test case: No file data available
2. Files were not successfully processed or no files were specified."""
            line_map = {}
            processing_logs.append("Using mock context (no chunks retrieved)")

        # Step 4: Generate AI response
        processing_logs.append(f"Generating AI response with {model_name} (format: {output_format})")

        response_result = await custom_agent.generate_response(
            context=context,
            section_name=section_name,
            section_description=section_description,
            template_description=test_data.get("description", "Test case"),
            project_description="Test case evaluation",
            output_format=format_enum,
            dependent_sections_context=None
        )

        processing_logs.append("AI response generated successfully")

        # Step 5: Extract citations using line_map
        cited_context = ""
        if format_enum == OutputFormat.TEXT and isinstance(response_result, str) and line_map:
            # Find all citation tags like [1], [2-3], [1758-1759]
            citation_pattern = r'\[(\d+(?:-\d+)?)\]'
            citations = re.findall(citation_pattern, response_result)

            # Parse citation ranges to get all line numbers
            cited_lines = set()
            for citation in citations:
                if '-' in citation:
                    start, end = citation.split('-')
                    cited_lines.update(range(int(start), int(end) + 1))
                else:
                    cited_lines.add(int(citation))

            # Build cited context from line_map
            if cited_lines:
                cited_entries = []
                for line_num in sorted(cited_lines):
                    line_key = str(line_num)
                    if line_key in line_map:
                        line_info = line_map[line_key]
                        text = line_info.get('text', '')
                        file_name = line_info.get('file_name', 'Unknown')
                        page = line_info.get('page', 'N/A')

                        entry = f"{line_num}. {text}"
                        if file_name != 'Unknown':
                            entry += f" (Source: {file_name}, Page {page})"

                        cited_entries.append(entry)

                cited_context = "\n\n".join(cited_entries)
                processing_logs.append(f"Extracted {len(cited_entries)} cited sources")

        # Build enhanced chunk info with page/line details
        enhanced_chunks = []
        for chunk in chunks:
            metadata = chunk.get("metadata", {})
            text = chunk.get("text", "")
            num_lines = len(text.split('\n'))

            page_start = metadata.get("page_start", metadata.get("page", 1))
            page_end = metadata.get("page_end", page_start)

            # Format page range
            if page_start == page_end:
                page_info = f"Page {page_start}"
            else:
                page_info = f"Pages {page_start}-{page_end}"

            # Line range info
            line_start = metadata.get("line_start", 1)
            line_end = metadata.get("line_end", line_start)
            if line_start == line_end:
                line_info = f"Line {line_start}"
            else:
                line_info = f"Lines {line_start}-{line_end}"

            enhanced_chunks.append({
                "text": text,
                "file_name": metadata.get("file_name", "Unknown"),
                "similarity_score": chunk.get("similarity_score", 0),
                "page_info": page_info,
                "line_info": line_info,
                "char_count": metadata.get("char_count", len(text)),
                "token_count": metadata.get("token_count", 0),
                "line_count": num_lines,
            })

        # Prepare response data
        response_text = response_result if format_enum == OutputFormat.TEXT else None
        response_data = response_result if format_enum in (OutputFormat.TABLE, OutputFormat.CHART) else None

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



@app.post("/playground/process")
async def process_playground(
    files: List[UploadFile] = File(default=[]),
    section_name: str = Form(...),
    section_description: str = Form(...),
):
    """
    Process playground request - run complete pipeline and return all intermediate steps.

    Returns:
        - queries: List of generated search queries
        - chunks: Retrieved chunks with similarity scores
        - context: Numbered context sent to AI
        - response: Final AI response with citations
    """
    try:
        from pipeline.search import Search

        # Processing logs
        processing_logs = []

        # Step 1: Generate search queries
        search = Search()
        queries = await search._generate_search_queries(
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
            parse = get_parse()

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
                    page_data, intake_content = await parse.parse_document(
                        str(file_path),
                        uploaded_file.filename
                    )

                    if not page_data:
                        processing_logs.append(f"Warning: No page data extracted from {uploaded_file.filename}")
                        continue

                    processing_logs.append(f"Parsed {len(page_data)} pages from {uploaded_file.filename}")

                    # Build chunks from page data
                    chunk_result = parse.build_chunks(page_data, str(file_path))
                    file_chunks = chunk_result["chunks"]
                    page_map = chunk_result.get("page_map", {})

                    if not file_chunks:
                        processing_logs.append(f"Warning: No chunks built from {uploaded_file.filename}")
                        continue

                    # Add page information to each chunk's metadata
                    for chunk in file_chunks:
                        start_line = chunk.get("start_line", 0)
                        end_line = chunk.get("end_line", start_line)

                        # Find page range
                        start_page = page_map.get(start_line, 1)
                        end_page = page_map.get(end_line, start_page)

                        chunk["metadata"] = chunk.get("metadata", {})
                        chunk["metadata"]["page_start"] = start_page
                        chunk["metadata"]["page_end"] = end_page
                        chunk["metadata"]["char_count"] = len(chunk.get("text", ""))

                    total_chunks_created += len(file_chunks)
                    processing_logs.append(f"Created {len(file_chunks)} chunks from {uploaded_file.filename}")

                    # Upsert chunks to Cosmos DB with embeddings
                    await cosmos_client.batch_upsert_documents(
                        chunks=file_chunks,
                        file_id=file_id,
                        file_name=uploaded_file.filename,
                        namespace="playground"  # Special namespace for playground files
                    )

                    processing_logs.append(f"Stored {len(file_chunks)} chunks with embeddings in Cosmos DB")

                    # Clean up temp file
                    file_path.unlink()

                except Exception as e:
                    processing_logs.append(f"Error processing {uploaded_file.filename}: {str(e)}")
                    continue

            # Execute search queries if we have file IDs
            if file_ids:
                try:
                    all_chunks = await search._execute_search_queries(queries, file_ids)
                    chunks = search._deduplicate_chunks(all_chunks)
                    processing_logs.append(f"Retrieved {len(chunks)} unique chunks from search")
                except Exception as e:
                    processing_logs.append(f"Search failed: {str(e)}")
                    chunks = []

        # Step 3: Build context
        context_builder = Context()
        if chunks:
            context_text, line_map = context_builder.build(chunks, full_excel_map={})
            encoding = tiktoken.encoding_for_model("gpt-4o")
            token_count = len(encoding.encode(context_text))
            processing_logs.append(f"Built context with {len(line_map)} lines (~{token_count:,} tokens)")
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
            line_map = {}
            processing_logs.append("Using mock context (no files uploaded)")

        # Step 4: Generate AI response
        processing_logs.append("Generating AI response")
        agent = get_agent()
        response = await agent.generate_response(
            context=context_text,
            section_name=section_name,
            section_description=section_description,
            template_description="Dev playground",
            project_description="Testing",
            output_format=OutputFormat.TEXT,
            dependent_sections_context=None,
        )
        processing_logs.append("AI response generated successfully")

        # Handle dict response (if JSON parsing failed)
        if isinstance(response, dict) and "raw" in response:
            response_text = response["raw"]
        else:
            response_text = response

        # Extract cited sources from response using line_map
        cited_context = ""
        if line_map:
            # Find all citation tags like [1], [2-3], [1758-1759]
            citation_pattern = r'\[(\d+(?:-\d+)?)\]'
            citations = re.findall(citation_pattern, response_text)

            logger.info(f"[PLAYGROUND] Found {len(citations)} citations in response: {citations}")
            logger.info(f"[PLAYGROUND] line_map has {len(line_map)} entries")

            # Parse citation ranges to get all line numbers
            cited_lines = set()
            for citation in citations:
                if '-' in citation:
                    start, end = citation.split('-')
                    cited_lines.update(range(int(start), int(end) + 1))
                else:
                    cited_lines.add(int(citation))

            logger.info(f"[PLAYGROUND] Extracted {len(cited_lines)} unique line numbers: {sorted(cited_lines)[:10]}...")

            # Build cited context from line_map
            if cited_lines:
                cited_entries = []
                for line_num in sorted(cited_lines):
                    line_key = str(line_num)
                    if line_key in line_map:
                        line_info = line_map[line_key]
                        # Build citation entry: line number + text + source info
                        text = line_info.get('text', '')
                        file_name = line_info.get('file_name', 'Unknown')
                        page = line_info.get('page', 'N/A')

                        entry = f"{line_num}. {text}"
                        if file_name != 'Unknown':
                            entry += f" (Source: {file_name}, Page {page})"

                        cited_entries.append(entry)

                cited_context = "\n\n".join(cited_entries)
                logger.info(f"[PLAYGROUND] Built cited context with {len(cited_entries)} entries")

        # Build enhanced chunk info with page/line details
        enhanced_chunks = []
        for chunk in chunks:
            metadata = chunk.get("metadata", {})
            text = chunk.get("text", "")
            num_lines = len(text.split('\n'))

            page_start = metadata.get("page_start", metadata.get("page", 1))
            page_end = metadata.get("page_end", page_start)

            # Format page range
            if page_start == page_end:
                page_info = f"Page {page_start}"
            else:
                page_info = f"Pages {page_start}-{page_end}"

            # Format line range
            start_line = chunk.get("start_line", metadata.get("start_line", 0))
            end_line = chunk.get("end_line", start_line + num_lines - 1)
            line_info = f"Lines {start_line}-{end_line}"

            enhanced_chunks.append({
                "text": text,
                "file_name": chunk.get("file_name", "unknown"),
                "similarity_score": chunk.get("score", 0.0),
                "page_info": page_info,
                "line_info": line_info,
                "char_count": len(text),
                "token_count": chunk.get("token_count", 0),
                "line_count": num_lines
            })

        return JSONResponse(
            {
                "queries": queries,
                "chunks": enhanced_chunks,
                "chunks_total": len(chunks),
                "context": context_text,
                "cited_context": cited_context,
                "response": response_text,
                "processing_logs": processing_logs,
            }
        )

    except Exception as e:
        logger.error(f"[PLAYGROUND] Error processing request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/playground-new/process")
async def process_playground_new(
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
        from pipeline.search import Search
        from clients.openai import create_azure_client

        # Processing logs
        processing_logs = []
        processing_logs.append(f"Using model: {model_name}")
        processing_logs.append(f"Output format: {output_format}")

        # Convert output_format string to enum
        try:
            format_enum = OutputFormat(output_format.lower())
        except ValueError:
            format_enum = OutputFormat.TEXT
            processing_logs.append(f"Invalid output format '{output_format}', defaulting to TEXT")

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
            parse = get_parse()

            total_chunks_created = 0

            # Process each uploaded file
            for uploaded_file in files:
                try:
                    # Generate unique file ID for playground
                    file_id = f"playground_new_{uuid4().hex[:8]}_{uploaded_file.filename}"
                    file_ids.append(file_id)

                    # Save file to temp directory
                    temp_dir = Path(tempfile.gettempdir()) / "playground_uploads"
                    temp_dir.mkdir(exist_ok=True)

                    file_path = temp_dir / uploaded_file.filename
                    with open(file_path, "wb") as f:
                        content = await uploaded_file.read()
                        f.write(content)

                    # Parse document to get page data
                    page_data, intake_content = await parse.parse_document(
                        str(file_path),
                        uploaded_file.filename
                    )

                    if not page_data:
                        processing_logs.append(f"Warning: No page data extracted from {uploaded_file.filename}")
                        continue

                    processing_logs.append(f"Parsed {len(page_data)} pages from {uploaded_file.filename}")

                    # Build chunks from page data
                    chunk_result = parse.build_chunks(page_data, str(file_path))
                    file_chunks = chunk_result["chunks"]
                    page_map = chunk_result.get("page_map", {})

                    if not file_chunks:
                        processing_logs.append(f"Warning: No chunks built from {uploaded_file.filename}")
                        continue

                    # Add page information to each chunk's metadata
                    for chunk in file_chunks:
                        start_line = chunk.get("start_line", 0)
                        end_line = chunk.get("end_line", start_line)

                        # Find page range
                        start_page = page_map.get(start_line, 1)
                        end_page = page_map.get(end_line, start_page)

                        chunk["metadata"] = chunk.get("metadata", {})
                        chunk["metadata"]["page_start"] = start_page
                        chunk["metadata"]["page_end"] = end_page
                        chunk["metadata"]["char_count"] = len(chunk.get("text", ""))

                    total_chunks_created += len(file_chunks)
                    processing_logs.append(f"Created {len(file_chunks)} chunks from {uploaded_file.filename}")

                    # Upsert chunks to Cosmos DB with embeddings
                    await cosmos_client.batch_upsert_documents(
                        chunks=file_chunks,
                        file_id=file_id,
                        file_name=uploaded_file.filename,
                        namespace="playground_new"  # Special namespace for new playground files
                    )

                    processing_logs.append(f"Stored {len(file_chunks)} chunks with embeddings in Cosmos DB")

                    # Clean up temp file
                    file_path.unlink()

                except Exception as e:
                    processing_logs.append(f"Error processing {uploaded_file.filename}: {str(e)}")
                    continue

            # Execute search queries if we have file IDs
            if file_ids:
                try:
                    all_chunks = await search._execute_search_queries(queries, file_ids)
                    chunks = search._deduplicate_chunks(all_chunks)
                    processing_logs.append(f"Retrieved {len(chunks)} unique chunks from search")
                except Exception as e:
                    processing_logs.append(f"Search failed: {str(e)}")
                    chunks = []

        # Step 3: Build context
        context_builder = Context()
        if chunks:
            context_text, line_map = context_builder.build(chunks, full_excel_map={})
            encoding = tiktoken.encoding_for_model("gpt-4o")
            token_count = len(encoding.encode(context_text))
            processing_logs.append(f"Built context with {len(line_map)} lines (~{token_count:,} tokens)")
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
            line_map = {}
            processing_logs.append("Using mock context (no files uploaded)")

        # Step 4: Generate AI response with custom agent
        processing_logs.append(f"Generating AI response with {model_name} (format: {format_enum.value})")
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

        # Extract cited sources from response using line_map
        cited_context = ""
        if line_map:
            # Find all citation tags like [1], [2-3], [1758-1759]
            citation_pattern = r'\[(\d+(?:-\d+)?)\]'
            citations = re.findall(citation_pattern, response_text)

            logger.info(f"[PLAYGROUND-NEW] Found {len(citations)} citations in response: {citations}")
            logger.info(f"[PLAYGROUND-NEW] line_map has {len(line_map)} entries")

            # Parse citation ranges to get all line numbers
            cited_lines = set()
            for citation in citations:
                if '-' in citation:
                    start, end = citation.split('-')
                    cited_lines.update(range(int(start), int(end) + 1))
                else:
                    cited_lines.add(int(citation))

            logger.info(f"[PLAYGROUND-NEW] Extracted {len(cited_lines)} unique line numbers: {sorted(cited_lines)[:10]}...")

            # Build cited context from line_map
            if cited_lines:
                cited_entries = []
                for line_num in sorted(cited_lines):
                    line_key = str(line_num)
                    if line_key in line_map:
                        line_info = line_map[line_key]
                        # Build citation entry: line number + text + source info
                        text = line_info.get('text', '')
                        file_name = line_info.get('file_name', 'Unknown')
                        page = line_info.get('page', 'N/A')

                        entry = f"{line_num}. {text}"
                        if file_name != 'Unknown':
                            entry += f" (Source: {file_name}, Page {page})"

                        cited_entries.append(entry)

                cited_context = "\n\n".join(cited_entries)
                logger.info(f"[PLAYGROUND-NEW] Built cited context with {len(cited_entries)} entries")

        # Build enhanced chunk info with page/line details
        enhanced_chunks = []
        for chunk in chunks:
            metadata = chunk.get("metadata", {})
            text = chunk.get("text", "")
            num_lines = len(text.split('\n'))

            page_start = metadata.get("page_start", metadata.get("page", 1))
            page_end = metadata.get("page_end", page_start)

            # Format page range
            if page_start == page_end:
                page_info = f"Page {page_start}"
            else:
                page_info = f"Pages {page_start}-{page_end}"

            # Format line range
            start_line = chunk.get("start_line", metadata.get("start_line", 0))
            end_line = chunk.get("end_line", start_line + num_lines - 1)
            line_info = f"Lines {start_line}-{end_line}"

            enhanced_chunks.append({
                "text": text,
                "file_name": chunk.get("file_name", "unknown"),
                "similarity_score": chunk.get("score", 0.0),
                "page_info": page_info,
                "line_info": line_info,
                "char_count": len(text),
                "token_count": chunk.get("token_count", 0),
                "line_count": num_lines
            })

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
        logger.error(f"[PLAYGROUND-NEW] Error processing request: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
