"""AI agent and prompt templates."""

from .agent import Agent
from .prompts import (
    OutputFormat,
    build_template_prompt_with_format,
    RETRIEVAL_PLANNER_PROMPT,
    INFORMATION_ANALYSIS_PROMPT,
    TEMPLATE_GENERATION_PROMPT,
    SECTION_DESCRIPTION_ENHANCEMENT_PROMPT,
    INTAKE_MINI_PROMPT,
    PROJECT_METADATA_GENERATION_PROMPT,
    STRUCTURE_ANALYSIS_PROMPT,
    TEMPLATE_FROM_STRUCTURE_PROMPT,
    EVALUATION_SYSTEM_PROMPT,
    EVALUATION_PROMPT,
)

# Singleton
_agent = None


def get_agent() -> Agent:
    """Get singleton Agent instance."""
    global _agent
    if _agent is None:
        _agent = Agent()
    return _agent
