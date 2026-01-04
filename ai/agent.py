"""AI agent for document analysis, section extraction, and retrieval planning."""

import json
import logging
import os
import re
import time
from datetime import datetime
from typing import Dict, List, Any, Union
from core.exceptions import AgentResponseError
from core import Analysis

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
    INFORMATION_ANALYSIS_PROMPT,
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
                f.write(full_prompt)

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

        start_time = time.time()
        response = await self.azure_client.chat.completions.create(**params)
        elapsed = time.time() - start_time
        self.logger.info(f"[TIMING] generate_response for '{section_name}': {elapsed:.2f}s (model: {self.model})")

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
            raise AgentResponseError("No queries generated by retrieval planner")

        self.logger.info(f"Planned {len(parsed['queries'])} queries for: {section_name}")
        return parsed['queries']

    async def analyze(
            self, section_name: str, section_description: str,
            context: str, template_description: str,
            project_description: str, formatted_response: str) -> Analysis:
        """Analyze how well the AI response answers the section."""

        try:
            formatted_prompt = INFORMATION_ANALYSIS_PROMPT.format(
                context_date=datetime.now().strftime("%B %d, %Y"),
                project_description=project_description,
                template_description=template_description,
                section_name=section_name,
                section_description=section_description,
                numbered_context=context,
                response=formatted_response
            )

            start_time = time.time()
            response = await self.azure_client.chat.completions.create(
                model=self.small_model,
                messages=[{"role": "user", "content": formatted_prompt}],
                temperature=0,
                response_format={"type": "json_object"},
                timeout=15
            )
            elapsed = time.time() - start_time
            self.logger.info(f"[TIMING] analyze for '{section_name}': {elapsed:.2f}s (model: {self.small_model})")

            result = json.loads(response.choices[0].message.content)
            # Filter to valid string queries
            queries = [q for q in result['searches'] if isinstance(q, str) and q.strip()]

            analysis = Analysis(
                score=result['score'],
                summary=result['summary'],
                queries=queries
            )

            self.logger.info(f"Analysis for {section_name}: {analysis.score}%")
            return analysis

        except Exception as e:
            self.logger.error(f"Analysis failed: {e}", exc_info=True)
            return Analysis(score=0, summary=f'Analysis failed: {e}', queries=[])
