"""FastAPI server for Studio."""

import logging

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import CORS_ORIGINS
from core.exceptions import (
    StudioError,
    ValidationError,
    AuthenticationError,
)
from routes import health, projects, templates, files, sections, web, exports, eval_kit

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("server")
logging.getLogger("httpx").setLevel(logging.WARNING)

# FastAPI app
app = FastAPI(title="Studio API")

# CORS
allowed_origins = ["http://localhost:3000"]
if CORS_ORIGINS:
    allowed_origins.extend(CORS_ORIGINS.split(","))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)


# Exception handlers
@app.exception_handler(StudioError)
async def studio_error_handler(_: Request, exc: StudioError):
    """Global handler for custom Studio errors."""
    status_code = 500
    if isinstance(exc, ValidationError):
        status_code = 400
    elif isinstance(exc, AuthenticationError):
        status_code = 401

    logger.error(
        f"Studio Error [{exc.__class__.__name__}]: {exc.message}", exc_info=True
    )

    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "error_type": exc.__class__.__name__,
            "detail": exc.message,
            "details": exc.details,
        },
    )


# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(templates.router, prefix="/templates", tags=["templates"])
app.include_router(files.router, prefix="/files", tags=["files"])
app.include_router(sections.router, prefix="/sections", tags=["sections"])
app.include_router(web.router, prefix="/web", tags=["web"])
app.include_router(exports.router, prefix="/exports", tags=["exports"])
app.include_router(eval_kit.router, tags=["eval"])


if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
