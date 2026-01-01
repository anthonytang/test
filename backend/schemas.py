"""Pydantic request/response models for Studio API."""

from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel

from ai import OutputFormat


class DependentSectionResult(BaseModel):
    """Result from a dependent section used in section processing."""

    section_id: str
    section_name: str
    section_type: str
    response: str


class ProjectCreateRequest(BaseModel):
    """Request to create a project from AI description."""

    description: str


class TemplateGenerateRequest(BaseModel):
    """Request to generate a template from description."""

    description: str
    project_name: str
    project_description: str
    project_metadata: Dict


class SectionProcessRequest(BaseModel):
    """Request to start section processing."""

    section_name: str
    section_description: str
    file_ids: List[UUID]
    project_metadata: Dict
    template_metadata: Dict
    output_format: OutputFormat
    dependent_section_results: Optional[List[DependentSectionResult]] = None


class SectionEnhanceRequest(BaseModel):
    """Request to enhance a section description."""

    description: str
    section_name: str
    section_type: str
    feedback: str


class SectionAbortRequest(BaseModel):
    """Request to abort section processing."""

    processing_id: str


class WebSearchRequest(BaseModel):
    """Request to search for URLs."""

    query: str
    max_results: int = 10


class WebCrawlRequest(BaseModel):
    """Request to crawl and index URLs."""

    urls: List[str]
    project_id: str


class ChartExportRequest(BaseModel):
    """Request to export chart to Excel."""

    section_name: str
    section_id: str
    chart_type: str  # 'bar', 'line', 'pie', 'area'
    chart_config: Dict[str, Any]  # xAxis, yAxes, colorScheme
    table_data: Dict[str, Any]  # rows with cells
    advanced_settings: Dict[str, Any]  # colorScheme, showLegend, etc.
