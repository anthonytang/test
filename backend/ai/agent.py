"""AI agent for document analysis, section extraction, and retrieval planning."""

import json
import logging
import os
import re
from datetime import datetime
from typing import Dict, List, Any, Union

from clients import get_azure_client
from core.config import (
    MODEL_NAME,
    SMALL_MODEL_NAME,
    AI_TIMEOUT_SECONDS,
    AI_TEMPERATURE,
    DEBUG_SAVE_PROMPTS,
)
from .prompts import (
    RETRIEVAL_PLANNER_PROMPT,
    build_template_prompt_with_format,
    OutputFormat,
    EVIDENCE_QUALITY_PROMPT
)


class Agent:
    """AI Agent for document analysis, section extraction, and retrieval planning."""

    def __init__(self, model: str = None, azure_client=None):
        self.logger = logging.getLogger(__name__)
        self.azure_client = azure_client if azure_client is not None else get_azure_client()
        self.model = model if model is not None else MODEL_NAME
        self.small_model = SMALL_MODEL_NAME

    def _get_temperature(self, model: str = None) -> float:
        """Get appropriate temperature for the model. Some models only support default temperature."""
        model_name = model or self.model
        # GPT-5.2 and o1 models only support temperature=1.0
        if 'gpt-5' in model_name.lower() or model_name.lower().startswith('o1'):
            return 1.0
        return AI_TEMPERATURE

    def _save_debug_prompt(self, section_name: str, full_prompt: str, context: str) -> None:
        """Save prompt to debug files. Only runs if DEBUG_SAVE_PROMPTS=true."""
        if not DEBUG_SAVE_PROMPTS:
            return

        try:
            # Create debug folder if it doesn't exist
            debug_dir = os.path.join(os.path.dirname(__file__), "debug_prompts")
            os.makedirs(debug_dir, exist_ok=True)

            # Create timestamp and safe filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_section_name = re.sub(r'[^\w\-]', '_', section_name)[:50]

            # Save full prompt
            prompt_filename = f"{timestamp}_{safe_section_name}_full_prompt.txt"
            prompt_path = os.path.join(debug_dir, prompt_filename)
            with open(prompt_path, 'w', encoding='utf-8') as f:
                f.write("=" * 80 + "\n")
                f.write(f"SECTION: {section_name}\n")
                f.write(f"TIMESTAMP: {timestamp}\n")
                f.write("=" * 80 + "\n\n")
                f.write("FULL PROMPT SENT TO LLM:\n")
                f.write("-" * 80 + "\n\n")
                f.write(full_prompt)

            # Save context only
            context_filename = f"{timestamp}_{safe_section_name}_context_only.txt"
            context_path = os.path.join(debug_dir, context_filename)
            with open(context_path, 'w', encoding='utf-8') as f:
                f.write("=" * 80 + "\n")
                f.write(f"SECTION: {section_name}\n")
                f.write(f"TIMESTAMP: {timestamp}\n")
                f.write("=" * 80 + "\n\n")
                f.write("CONTEXT SENT TO LLM:\n")
                f.write("-" * 80 + "\n\n")
                f.write(context)

            self.logger.info(f"[DEBUG] Saved prompt to: {prompt_filename}")

        except Exception as e:
            # Don't fail the main operation if debug save fails
            self.logger.warning(f"[DEBUG] Failed to save debug prompt: {e}")

    async def generate_response(
            self, context: str, section_name: str, section_description: str,
            template_description: str, project_description: str,
            output_format: OutputFormat,
            dependent_sections_context: str | None) -> Union[str, Dict[str, Any]]:
        """Generate AI response for a section. Returns raw text (TEXT) or parsed JSON (TABLE/CHART)."""
        if not context or not context.strip():
            raise ValueError("Context cannot be empty")
        if not section_name or not section_name.strip():
            raise ValueError("Section name cannot be empty")
        if not section_description or not section_description.strip():
            raise ValueError("Section description cannot be empty")

        formatted_prompt = build_template_prompt_with_format(
            section_name=section_name,
            section_description=section_description,
            numbered_context=context,
            context_date=datetime.now().strftime("%B %d, %Y"),
            template_description=template_description,
            project_description=project_description,
            output_format=output_format,
            dependent_sections_context=dependent_sections_context
        )

        messages = [
            {"role": "system", "content": formatted_prompt},
            {"role": "user", "content": f"Extract the {section_name}."}
        ]

        self._save_debug_prompt(section_name, formatted_prompt, context)

        params = {
            "model": self.model,
            "messages": messages,
            "temperature": self._get_temperature(),
            "timeout": AI_TIMEOUT_SECONDS
        }
        if output_format in (OutputFormat.TABLE, OutputFormat.CHART):
            params["response_format"] = {"type": "json_object"}

        response = await self.azure_client.chat.completions.create(**params)
        raw_content = response.choices[0].message.content

        if output_format == OutputFormat.TEXT:
            return raw_content

        try:
            return json.loads(raw_content)
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse JSON response: {e}")
            return {"error": f"Invalid JSON: {e}", "raw": raw_content[:500]}

    async def plan_retrieval(
            self, section_name: str, section_description: str,
            template_description: str, project_description: str) -> List[str]:
        """Generate retrieval queries for a section. Returns list of query strings."""
        if not section_name or not section_name.strip():
            raise ValueError("Section name cannot be empty")
        if not section_description or not section_description.strip():
            raise ValueError("Section description cannot be empty")

        formatted_prompt = RETRIEVAL_PLANNER_PROMPT.format(
            section_name=section_name,
            section_description=section_description,
            context_date=datetime.now().strftime("%B %d, %Y"),
            template_description=template_description,
            project_description=project_description
        )

        messages = [
            {"role": "system", "content": formatted_prompt},
            {"role": "user", "content": "Plan retrieval."}
        ]

        response = await self.azure_client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=self._get_temperature(),
            response_format={"type": "json_object"},
            timeout=AI_TIMEOUT_SECONDS
        )

        parsed = json.loads(response.choices[0].message.content)
        if 'queries' not in parsed or not parsed['queries']:
            raise ValueError("No queries generated")

        self.logger.info(f"Planned {len(parsed['queries'])} queries for: {section_name}")
        return parsed['queries']

    async def analyze_evidence_quality(
            self, section_name: str, section_description: str,
            context: str, template_description: str,
            project_description: str) -> Dict[str, Any]:
        """Analyze if retrieved docs have sufficient info. Returns score and suggested searches."""
        default_result = {'sufficiency_score': 0, 'search_queries': [], 'summary': ''}

        if not context or not context.strip():
            return {**default_result, 'summary': 'No context provided'}
        if not section_name or not section_name.strip():
            return {**default_result, 'summary': 'No section name provided'}

        try:
            formatted_prompt = EVIDENCE_QUALITY_PROMPT.format(
                context_date=datetime.now().strftime("%B %d, %Y"),
                project_description=project_description,
                template_description=template_description,
                section_name=section_name,
                section_description=section_description,
                numbered_context=context
            )

            response = await self.azure_client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an evidence auditor. Return only valid JSON."},
                    {"role": "user", "content": formatted_prompt}
                ],
                temperature=self._get_temperature(),
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)
            result.setdefault('sufficiency_score', 0)
            result.setdefault('search_queries', [])
            result.setdefault('summary', '')

            self.logger.info(f"Evidence analysis for {section_name}: {result.get('sufficiency_score')}%")
            return result

        except Exception as e:
            self.logger.error(f"Evidence analysis failed: {e}")
            return {**default_result, 'summary': f'Analysis failed: {e}'}

