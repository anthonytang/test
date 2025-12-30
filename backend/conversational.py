"""Conversational AI for natural language interactions."""

import json
import logging
from typing import Dict, Any, Optional
from datetime import datetime

from clients import get_azure_client
from core.config import MODEL_NAME, AI_TIMEOUT_SECONDS, CONVERSATIONAL_TEMPERATURE
from ai import (
    PROJECT_METADATA_GENERATION_PROMPT,
    TEMPLATE_GENERATION_PROMPT,
    SECTION_DESCRIPTION_ENHANCEMENT_PROMPT
)
from core.exceptions import AgentResponseError, ValidationError


class Conversational:
    """Conversational AI for natural language interactions."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.azure_client = get_azure_client()
        self.model = MODEL_NAME

    async def parse_project_request(
        self,
        user_input: str
    ) -> Dict[str, Any]:
        """Parse user's natural language into project name and metadata structure."""
        if not user_input or not user_input.strip():
            raise ValidationError("User input cannot be empty")

        # Build the prompt
        prompt = PROJECT_METADATA_GENERATION_PROMPT.format(
            user_brief=user_input,
            context_date=datetime.now().strftime("%B %d, %Y")
        )

        # Call Azure OpenAI
        response = await self.azure_client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=CONVERSATIONAL_TEMPERATURE,
            response_format={"type": "json_object"},
            timeout=AI_TIMEOUT_SECONDS
        )

        raw_response = response.choices[0].message.content
        result = json.loads(raw_response)

        self.logger.info(f"Created project: {result['name']}")
        return result

    async def parse_template_request(
            self, user_input: str,
            project_name: Optional[str] = None,
            project_description: Optional[str] = None,
            project_metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Parse user's natural language into template structure with sections."""
        if not user_input or not user_input.strip():
            raise ValidationError("User input cannot be empty")

        # Build project context if provided
        parts = []
        if project_name:
            parts.append(f"Project: {project_name}")
        if project_description:
            parts.append(f"Description: {project_description}")
        if project_metadata:
            for key, value in project_metadata.items():
                if value and str(value).strip():
                    parts.append(f"{key}: {value}")

        project_context = "\n\nContext:\n" + "\n".join(parts)

        prompt = TEMPLATE_GENERATION_PROMPT.format(
            description=user_input,
            project_context=project_context
        )

        response = await self.azure_client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=CONVERSATIONAL_TEMPERATURE,
            response_format={"type": "json_object"},
            timeout=AI_TIMEOUT_SECONDS
        )

        parsed = json.loads(response.choices[0].message.content)

        if 'template' not in parsed:
            raise AgentResponseError("Response missing 'template' structure")
        if 'sections' not in parsed:
            raise AgentResponseError("Response missing 'sections' structure")

        self.logger.info(f"Generated template '{parsed['template'].get('name')}' with {len(parsed['sections'])} sections")
        return parsed

    async def refine_section_description(
            self, current_description: str, section_name: str,
            section_type: str, user_feedback: str) -> str:
        """Refine a section description based on user feedback."""

        # Build context dynamically based on what's provided
        context_parts = []
        if section_name:
            context_parts.append(f"Section: {section_name}")
        if section_type:
            context_parts.append(f"Type: {section_type}")
        if current_description:
            context_parts.append(f"Current Description: {current_description}")
        if user_feedback:
            context_parts.append(f"User Feedback: {user_feedback}")

        context = "\n".join(context_parts)
        formatted_prompt = SECTION_DESCRIPTION_ENHANCEMENT_PROMPT.format(context=context)

        response = await self.azure_client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": formatted_prompt}],
            temperature=CONVERSATIONAL_TEMPERATURE,
            response_format={"type": "json_object"},
            timeout=AI_TIMEOUT_SECONDS
        )

        parsed = json.loads(response.choices[0].message.content)

        result = parsed["description"].strip()
        if not result:
            raise AgentResponseError("Empty response from enhancement agent")

        return result
