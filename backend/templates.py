"""Template extraction from uploaded documents using AI structure analysis."""

import json
import logging
from typing import Optional

import tiktoken

from clients import get_azure_client
from pipeline import get_parse
from core.config import MODEL_NAME, TEMPLATE_GENERATION_TEMPERATURE, TEMPLATE_MAX_TOKENS
from ai import STRUCTURE_ANALYSIS_PROMPT, TEMPLATE_FROM_STRUCTURE_PROMPT

logger = logging.getLogger(__name__)


class TemplateExtractor:
    def __init__(self):
        self.azure_client = get_azure_client()
        self.model = MODEL_NAME
        self.parser = get_parse()

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
            raise ValueError("Invalid JSON response from structure analysis")

        return structure

    async def _convert_structure_to_template(self, structure: dict, template_name: Optional[str] = None) -> dict:
        """
        STEP 2: Convert the structure analysis into a reusable template.
        Takes the forensic structure and outputs template JSON with sections.
        """
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
            template_result = json.loads(response_text)
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON response from template generation")

        # Override template name if provided
        if template_name and template_result.get("template"):
            template_result["template"]["name"] = template_name

        return template_result

    async def generate_template_from_document(self, file_path, template_name=None):
        """Generate a complete template from a document file with streaming events."""
        yield {"event": "progress", "data": {"progress": 0, "message": "Parsing"}}
        markdown_content = await self.parser.convert_to_markdown(file_path)

        yield {"event": "progress", "data": {"progress": 25, "message": "Analyzing"}}
        structure = await self._analyze_document_structure(markdown_content)

        yield {"event": "progress", "data": {"progress": 60, "message": "Generating"}}
        result = await self._convert_structure_to_template(structure, template_name)

        yield {"event": "complete", "data": {"progress": 100, "template": result, "structure": structure}}
