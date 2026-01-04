"""Gotenberg client for document to PDF conversion."""

import logging
from pathlib import Path

import httpx

from core.config import GOTENBERG_URL
from core.exceptions import ConversionError

logger = logging.getLogger(__name__)


class GotenbergClient:
    """Client for Gotenberg PDF conversion service."""

    def __init__(self):
        if not GOTENBERG_URL:
            raise ConversionError("GOTENBERG_URL not configured")
        self.base_url = GOTENBERG_URL
        self.timeout = 120.0

    async def convert_to_pdf(self, file_path: str) -> bytes:
        """Convert document to PDF using Gotenberg LibreOffice endpoint."""
        file_name = Path(file_path).name

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                with open(file_path, "rb") as f:
                    response = await client.post(
                        f"{self.base_url}/forms/libreoffice/convert",
                        files={"files": (file_name, f)},
                    )

                if response.status_code == 200:
                    logger.info(
                        f"Converted {file_name} to PDF ({len(response.content)} bytes)"
                    )
                    return response.content
                else:
                    error = response.text[:200] if response.text else "Unknown error"
                    raise ConversionError(
                        f"PDF conversion failed ({response.status_code}): {error}"
                    )

        except httpx.TimeoutException:
            raise ConversionError(f"PDF conversion timed out for {file_name}")
        except httpx.RequestError as e:
            raise ConversionError(f"Failed to connect to Gotenberg: {e}")
        except ConversionError:
            raise
        except Exception as e:
            raise ConversionError(f"PDF conversion failed: {e}")

    async def health_check(self) -> bool:
        """Check if Gotenberg is running."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.base_url}/health")
                return response.status_code == 200
        except Exception:
            return False
