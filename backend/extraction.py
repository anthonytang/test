"""Template extraction from uploaded documents using AI structure analysis."""

import json
import logging
import os
import tempfile
from pathlib import Path

import tiktoken

from clients import get_azure_client, get_gotenberg_client
from pipeline import get_parser
from core.config import (
    MODEL_NAME,
    TEMPLATE_GENERATION_TEMPERATURE,
    TEMPLATE_MAX_TOKENS,
    CONVERTIBLE_EXTENSIONS,
    TABLE_EXTENSIONS,
)
from ai import STRUCTURE_ANALYSIS_PROMPT, TEMPLATE_FROM_STRUCTURE_PROMPT
from core.exceptions import ParsingError, AIError

logger = logging.getLogger(__name__)


class TemplateExtractor:
    def __init__(self):
        self.azure_client = get_azure_client()
        self.model = MODEL_NAME
        self.parser = get_parser()

    async def _analyze_document_structure(self, markdown_content: str) -> dict:
        """
        STEP 1: Forensic structure analysis of the document.
        Returns a detailed JSON structure with sections, subsections, content_kinds, key_topics.
        """
        # Truncate if too long
        encoding = tiktoken.encoding_for_model("gpt-4o")
        tokens = encoding.encode(markdown_content)
        if len(tokens) > TEMPLATE_MAX_TOKENS:
            logger.warning("Document truncated from %d to %d tokens", len(tokens), TEMPLATE_MAX_TOKENS)
            markdown_content = encoding.decode(tokens[:TEMPLATE_MAX_TOKENS])

        prompt = f"{STRUCTURE_ANALYSIS_PROMPT}\n\nDOCUMENT:\n{markdown_content}"

        response = await self.azure_client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You are a forensic document structure analyst. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=TEMPLATE_GENERATION_TEMPERATURE,
            response_format={"type": "json_object"}
        )

        response_text = response.choices[0].message.content.strip()
        try:
            structure = json.loads(response_text)
        except json.JSONDecodeError:
            raise AIError("Invalid JSON response from structure analysis")

        return structure

    async def _convert_structure_to_template(self, structure: dict) -> dict:
        """Convert structure analysis into a reusable template."""
        structure_json = json.dumps(structure, indent=2)
        prompt = f"{TEMPLATE_FROM_STRUCTURE_PROMPT}\n\nSTRUCTURE:\n{structure_json}"

        response = await self.azure_client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": "You are a template architect. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=TEMPLATE_GENERATION_TEMPERATURE,
            response_format={"type": "json_object"}
        )

        response_text = response.choices[0].message.content.strip()
        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            raise AIError("Invalid JSON response from template generation")

    async def generate_template_from_document(self, file_path: str):
        """Generate a template from a document file with streaming progress events."""
        converted_path = None

        try:
            yield {"event": "progress", "data": {"progress": 0, "message": "Converting"}}

            ext = Path(file_path).suffix.lower()
            is_table = ext in TABLE_EXTENSIONS
            parse_path = file_path

            # Convert Word/PPT/etc to PDF via Gotenberg
            if ext in CONVERTIBLE_EXTENSIONS:
                pdf_bytes = await get_gotenberg_client().convert_to_pdf(file_path)
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
                    f.write(pdf_bytes)
                    converted_path = f.name
                    parse_path = converted_path

            yield {"event": "progress", "data": {"progress": 10, "message": "Parsing"}}
            data = await self.parser.parse_document(parse_path)
            text_content = self.parser.get_full_text(data, is_table)

            yield {"event": "progress", "data": {"progress": 30, "message": "Analyzing"}}
            structure = await self._analyze_document_structure(text_content)

            yield {"event": "progress", "data": {"progress": 60, "message": "Generating"}}
            result = await self._convert_structure_to_template(structure)

            yield {"event": "complete", "data": {"progress": 100, "template": result, "structure": structure}}

        except ParsingError:
            raise
        except Exception as e:
            logger.error(f"Template extraction failed: {e}", exc_info=True)
            raise ParsingError(f"Failed to parse document: {e}")
        finally:
            if converted_path and os.path.exists(converted_path):
                os.unlink(converted_path)
