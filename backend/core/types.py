"""
Document processing types.

Type Lifecycle:
═══════════════

1. PARSING (file → chunks)
   File → Parse(chunks, content, sheets)

   - Unit: atomic content piece (one line or cell)
   - Chunk: group of units for vector storage
   - Parse: complete parse output with content index

2. RETRIEVAL (search → matches)
   Query → Match[]

   - Match: chunk with similarity score and metadata
   - Source: unit lookup map for citation processing

3. GENERATION (context → response)
   Matches + Prompt → Response (Text | Table | Chart)

   - Item: text with citation tags
   - Row: table/chart row of items
   - Response: discriminated union of output formats

4. CITATION (tags → scored citations)
   Source map + Response → Citation[]

   - Citation: grouped units with similarity score
   - Outcome: final result with response + citations + analysis
"""

from typing import Annotated, Dict, List, Optional, Literal, Union
from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────
# Core Types
# ─────────────────────────────────────────────────────────────


class BoundingBox(BaseModel):
    """Normalized bounding box as percentages (0-100) of page dimensions.

    Used for PDF text highlighting. Coordinates are viewport-independent,
    extracted from Azure Document Intelligence polygon data.
    """

    left: float  # Distance from left edge (%)
    top: float  # Distance from top edge (%)
    width: float  # Width of bounding box (%)
    height: float  # Height of bounding box (%)


class Line(BaseModel):
    """A line of text with optional bounding box.

    For PDFs: bounds extracted from Azure Document Intelligence.
    For other documents: bounds is None.
    """

    text: str
    bounds: Optional[BoundingBox] = None


class Location(BaseModel):
    """Position in source document (page for PDF, sheet/row/col for Excel)."""

    page: Optional[int] = None
    sheet: Optional[str] = None
    row: Optional[int] = None
    col: Optional[str] = None
    bounds: Optional[BoundingBox] = None  # Required for PDF text units


class File(BaseModel):
    """Source document reference."""

    id: str
    name: str


class Meta(BaseModel):
    """Document metadata extracted by AI during file processing."""

    company: Optional[str] = None
    ticker: Optional[str] = None
    doc_type: Optional[str] = None
    period_label: Optional[str] = None
    blurb: Optional[str] = None


class Unit(BaseModel):
    """Atomic content piece - one line of text or one cell."""

    id: str
    type: Literal["text", "table"]
    text: str
    location: Location


# ─────────────────────────────────────────────────────────────
# Excel Types
# ─────────────────────────────────────────────────────────────


class Dimensions(BaseModel):
    """Excel sheet dimensions."""

    max_row: int
    max_col: int


class Cell(BaseModel):
    """Excel cell with position."""

    value: str
    row: int
    col: str


class Sheet(BaseModel):
    """Full Excel sheet for recovering truncated table chunks."""

    cells: Dict[str, Cell]
    dimensions: Dimensions
    tokens: int


class Slice(BaseModel):
    """Table chunk metadata - indicates if chunk was truncated."""

    sheet: str
    truncated: bool = False


# ─────────────────────────────────────────────────────────────
# Parsing Types (file → structured chunks)
# ─────────────────────────────────────────────────────────────


class Chunk(BaseModel):
    """Group of units for vector storage. Created during file parsing."""

    file: File
    units: List[Unit]
    tokens: int
    slice: Optional[Slice] = None


class Parse(BaseModel):
    """Complete parse output from document processing."""

    chunks: List[Chunk]
    content: Dict[str, Unit]  # unit_id → Unit lookup
    sheets: Dict[str, Sheet] = Field(default_factory=dict)


# ─────────────────────────────────────────────────────────────
# Retrieval Types (search → scored matches)
# ─────────────────────────────────────────────────────────────


class Match(Chunk):
    """Chunk returned from vector search with similarity score."""

    id: str
    score: float
    meta: Meta


class Source(BaseModel):
    """Unit lookup for citation processing.

    Created during context building: maps global citation ID → unit.
    Used to resolve AI's numeric tags back to source content.
    """

    unit: Unit
    file: File
    meta: Meta


# ─────────────────────────────────────────────────────────────
# Response Types (AI output formats)
# ─────────────────────────────────────────────────────────────


class Item(BaseModel):
    """Response item with citation tags. Tags are global IDs like '1', '2'."""

    text: str
    tags: List[str]


class Row(BaseModel):
    """Table/chart row of items."""

    cells: List[Item]


class Text(BaseModel):
    """Text format response - paragraphs with inline citations."""

    type: Literal["text"] = "text"
    items: List[Item]


class Table(BaseModel):
    """Table format response - rows with cited cells."""

    type: Literal["table"] = "table"
    rows: List[Row]


class Chart(BaseModel):
    """Chart format response - table data with suggested visualization."""

    type: Literal["chart"] = "chart"
    rows: List[Row]
    chart: Literal["bar", "line", "pie", "area"]


Response = Annotated[Union[Text, Table, Chart], Field(discriminator="type")]


# ─────────────────────────────────────────────────────────────
# Outcome Types (final pipeline output)
# ─────────────────────────────────────────────────────────────


class Citation(BaseModel):
    """Scored citation with source units.

    Created from grouping Sources after AI response parsing.
    Score indicates semantic similarity between cited text and response.
    """

    units: List[Unit]
    file: File
    score: float


class Analysis(BaseModel):
    """Response quality analysis from AI."""

    score: int
    summary: str
    queries: List[str]


class Outcome(BaseModel):
    """Complete pipeline result - stored in database results table."""

    response: Response
    citations: Dict[str, Citation]
    analysis: Analysis
