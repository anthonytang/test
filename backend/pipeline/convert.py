"""Document parsing and chunking for PDF, Excel, Word, PowerPoint, HTML, and Markdown."""

import os
import time
import logging
import json
import csv
import asyncio
import chardet
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

import tiktoken
from markitdown import MarkItDown
import openpyxl
import spacy

from clients import get_azure_client, get_doc_intel_client
from core.config import (
    SMALL_MODEL_NAME,
    PARSE_MAX_TOKENS,
    PARSE_OVERLAP_TOKENS,
    PARSE_TOKENIZER_ENCODING,
    AI_TEMPERATURE,
    TABLE_MAX_TOKENS_PER_CHUNK,
    TABLE_EMPTY_ROW_THRESHOLD,
    TABLE_MAX_ROWS_TO_SCAN,
    DEBUG_SAVE_PROMPTS,
)
from ai import INTAKE_MINI_PROMPT
from core import (
    Unit,
    Location,
    File,
    Slice,
    Chunk,
    Cell,
    Dimensions,
    Sheet,
    Parse,
    Meta,
    BoundingBox,
    Line,
)

# Debug mode - dumps chunk results to JSON files
DEBUG_DIR = Path(__file__).parent / "testing"
if DEBUG_SAVE_PROMPTS:
    DEBUG_DIR.mkdir(exist_ok=True)


# ─────────────────────────────────────────────────────────────
# Helpers: Create Lines from various sources
# ─────────────────────────────────────────────────────────────


def polygon_to_bounds(
    polygon: List[float], page_width: float, page_height: float
) -> BoundingBox:
    """Convert Azure Document Intelligence polygon to normalized bounding box.

    Args:
        polygon: 8 floats [x1,y1, x2,y2, x3,y3, x4,y4] clockwise from top-left (in inches)
        page_width: Page width in inches
        page_height: Page height in inches

    Returns:
        BoundingBox with left, top, width, height as percentages (0-100)
    """
    left = (polygon[0] / page_width) * 100
    top = (polygon[1] / page_height) * 100
    width = ((polygon[2] - polygon[0]) / page_width) * 100
    height = ((polygon[5] - polygon[1]) / page_height) * 100

    return BoundingBox(
        left=max(0, left),
        top=max(0, top),
        width=max(0, width),
        height=max(0, height),
    )


def make_lines(texts: List[str]) -> List[Line]:
    """Create Line objects from text strings (no bounding boxes)."""
    return [Line(text=t) for t in texts if t.strip()]


def split_by_newlines(text: str) -> List[Line]:
    """Split text by newlines into Lines."""
    return make_lines(text.split("\n"))


class Parser:
    """Document parser with chunking and metadata extraction."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.tokenizer = tiktoken.get_encoding(PARSE_TOKENIZER_ENCODING)
        self.azure_client = get_azure_client()
        self.markitdown = MarkItDown()
        self.nlp = spacy.blank("en")
        self.nlp.add_pipe("sentencizer")
        self.nlp.max_length = 2000000
        self.azure_doc_intel_client = get_doc_intel_client()

    def build_chunks(self, page_data: list, file: File) -> Parse:
        """Build chunks with units from parsed document data."""
        is_table = file.name.lower().endswith((".xlsx", ".xls", ".csv"))

        if is_table:
            result = self._build_table_chunks(page_data, file)
        else:
            result = self._build_text_chunks(page_data, file)

        if DEBUG_SAVE_PROMPTS:
            self._dump_debug(file.name, result)

        return result

    async def convert_to_markdown(self, file_path: str) -> str:
        """Convert any supported file to markdown text."""
        if not file_path or not os.path.exists(file_path):
            raise ValueError(f"Invalid file path: {file_path}")

        file_ext = file_path.lower()

        if file_ext.endswith(".pdf"):
            file_name = os.path.basename(file_path)
            page_data, _ = await self._parse_pdf(file_path, file_name)
            return "\n\n".join(
                "\n".join(line.text for line in page["lines"]) for page in page_data
            )

        elif file_ext.endswith((".xlsx", ".xls")):
            sheet_data = await asyncio.to_thread(self.parse_excel_to_sheets, file_path)
            return "\n\n".join(sheet["text"] for sheet in sheet_data)

        elif file_ext.endswith(".csv"):
            sheet_data = await asyncio.to_thread(self.parse_csv_to_sheets, file_path)
            return sheet_data[0]["text"]

        elif file_ext.endswith(".md"):
            return await asyncio.to_thread(self._read_text_file, file_path)

        else:
            result = await asyncio.to_thread(self.markitdown.convert, file_path)
            return result.text_content

    async def parse_document(self, file_path: str, file_name: str) -> tuple[list, str]:
        """Parse document into page_data and intake_content for metadata analysis.

        Returns:
            page_data: List of pages, each with {"page": int, "lines": List[Line]}
            intake_content: Text preview for metadata extraction

        All text document types return the same standardized format with 'lines'.
        Tables (Excel/CSV) have their own format with 'cells'.
        """
        if not file_path or not os.path.exists(file_path):
            raise ValueError(f"Invalid file path: {file_path}")

        ext = file_path.lower()

        if ext.endswith(".pdf"):
            return await self._parse_pdf(file_path, file_name)

        elif ext.endswith((".xlsx", ".xls", ".csv")):
            if ext.endswith(".csv"):
                sheet_data = await asyncio.to_thread(
                    self.parse_csv_to_sheets, file_path
                )
            else:
                sheet_data = await asyncio.to_thread(
                    self.parse_excel_to_sheets, file_path
                )
            intake_content = sheet_data[0]["text"]
            return sheet_data, intake_content

        elif ext.endswith(".md"):
            text_content = await asyncio.to_thread(self._read_text_file, file_path)
            lines = split_by_newlines(text_content)
            page_data = [{"page": 1, "lines": lines}]
            return page_data, text_content

        elif ext.endswith(".pptx"):
            return await asyncio.to_thread(self._parse_pptx, file_path)

        else:
            # Word, HTML, etc. - split by sentences for better chunking
            result = await asyncio.to_thread(self.markitdown.convert, file_path)
            sentences = self._split_into_sentences(result.text_content)
            lines = make_lines(sentences)
            page_data = [{"page": 1, "lines": lines}]
            return page_data, result.text_content

    async def _parse_pdf(self, file_path: str, file_name: str) -> tuple[list, str]:
        """Parse PDF using Azure Document Intelligence.

        Returns page_data with Line objects containing text and bounding boxes.
        Bounding boxes are normalized to percentages (0-100) for viewport-independent rendering.
        """
        result = await self.azure_doc_intel_client.analyze_document(file_path)

        page_data = []
        for page_idx, page in enumerate(result.pages, 1):
            if not page.lines:
                continue

            page_width = page.width
            page_height = page.height

            lines: List[Line] = []
            for line in page.lines:
                poly = line.polygon
                if poly and len(poly) >= 8:
                    bounds = polygon_to_bounds(poly, page_width, page_height)
                    lines.append(Line(text=line.content, bounds=bounds))
                else:
                    self.logger.warning(
                        f"Missing polygon for line: {line.content[:50]}"
                    )
                    lines.append(Line(text=line.content))

            page_data.append({"page": page_idx, "lines": lines})

        intake_content = "\n".join(line.text for line in page_data[0]["lines"])
        self.logger.info(f"PDF parsed: {file_name} | {len(page_data)} pages")
        return page_data, intake_content

    def _parse_pptx(self, file_path: str) -> tuple[list, str]:
        """Parse PowerPoint file using MarkItDown, extracting slide numbers."""
        result = self.markitdown.convert(file_path)
        content = result.text_content

        # Split by slide markers: <!-- Slide number: X -->
        slide_pattern = re.compile(r"<!--\s*Slide\s+number:\s*(\d+)\s*-->")
        parts = slide_pattern.split(content)

        # parts = [before_first_slide, slide_1_num, slide_1_content, slide_2_num, slide_2_content, ...]
        page_data = []
        for i in range(1, len(parts), 2):
            slide_num = int(parts[i])
            slide_text = parts[i + 1].strip()
            if slide_text:
                lines = split_by_newlines(slide_text)
                page_data.append({"page": slide_num, "lines": lines})

        intake_content = "\n".join(line.text for line in page_data[0]["lines"])
        self.logger.info(f"PowerPoint parsed: {len(page_data)} slides")
        return page_data, intake_content

    def _split_oversized_line(self, text: str) -> List[str]:
        """Split a line that exceeds PARSE_MAX_TOKENS into smaller pieces."""
        tokens = self.tokenizer.encode(text)
        if len(tokens) <= PARSE_MAX_TOKENS:
            return [text]

        pieces = []
        for i in range(0, len(tokens), PARSE_MAX_TOKENS):
            chunk_tokens = tokens[i : i + PARSE_MAX_TOKENS]
            pieces.append(self.tokenizer.decode(chunk_tokens))
        return pieces

    def _build_text_chunks(self, page_data: list, file: File) -> Parse:
        """Build units and token-limited chunks with overlap for text documents.

        Expects page_data with standardized format: {"page": int, "lines": List[Line]}
        """
        content: Dict[str, Unit] = {}
        all_units: List[Tuple[Unit, int]] = []

        unit_num = 1
        for page_info in page_data:
            page_num = page_info["page"]
            lines: List[Line] = page_info["lines"]

            for line in lines:
                for piece in self._split_oversized_line(line.text):
                    unit_id = str(unit_num)
                    unit = Unit(
                        id=unit_id,
                        type="text",
                        text=piece,
                        location=Location(page=page_num, bounds=line.bounds),
                    )
                    tokens = len(self.tokenizer.encode(piece))
                    all_units.append((unit, tokens))
                    content[unit_id] = unit
                    unit_num += 1

        if not all_units:
            return Parse(chunks=[], content={}, sheets={})

        chunks: List[Chunk] = []
        idx = 0
        while idx < len(all_units):
            chunk_units: List[Unit] = []
            chunk_tokens = 0
            chunk_start_idx = idx

            while idx < len(all_units):
                unit, tokens = all_units[idx]
                if chunk_tokens + tokens > PARSE_MAX_TOKENS and chunk_units:
                    break
                chunk_units.append(unit)
                chunk_tokens += tokens
                idx += 1

            if chunk_units:
                chunks.append(Chunk(file=file, units=chunk_units, tokens=chunk_tokens))

            if idx < len(all_units):
                overlap_tokens = 0
                backtrack_idx = idx
                while backtrack_idx > chunk_start_idx + 1:
                    backtrack_idx -= 1
                    _, tokens = all_units[backtrack_idx]
                    overlap_tokens += tokens
                    if overlap_tokens >= PARSE_OVERLAP_TOKENS:
                        break
                idx = backtrack_idx

        return Parse(chunks=chunks, content=content, sheets={})

    def parse_excel_to_sheets(self, file_path: str) -> List[Dict[str, Any]]:
        """Parse Excel file into sheet data with text and cell maps."""
        start_time = time.time()

        try:
            workbook = openpyxl.load_workbook(file_path, data_only=True, read_only=True)
        except Exception as e:
            raise ValueError(f"Failed to load Excel: {e}")

        sheet_data: List[Dict[str, Any]] = []

        for sheet_name in workbook.sheetnames:
            try:
                rows = self._read_excel_sheet(workbook[sheet_name])
                max_row, max_col = self._get_table_boundaries(rows)
                sheet_text, cells = self._build_table_data(
                    rows, sheet_name, max_row, max_col
                )

                sheet_data.append(
                    {
                        "metadata": {
                            "sheet_name": sheet_name,
                            "sheet_index": len(sheet_data) + 1,
                        },
                        "text": sheet_text,
                        "cells": cells,
                        "dimensions": {"max_row": max_row, "max_col": max_col},
                    }
                )
            except Exception as e:
                self.logger.error(f"Error processing sheet '{sheet_name}': {e}")
                continue

        if hasattr(workbook, "close"):
            workbook.close()

        self.logger.info(
            f"Excel parsed in {time.time() - start_time:.2f}s: {len(sheet_data)} sheets"
        )

        if not sheet_data:
            raise ValueError("No sheets processed from Excel file")

        return sheet_data

    def parse_csv_to_sheets(self, file_path: str) -> List[Dict[str, Any]]:
        """Parse CSV file into sheet data with text and cell maps."""
        sheet_name = "Data"

        rows = self._read_csv_file(file_path)
        max_row, max_col = self._get_table_boundaries(rows)
        sheet_text, cells = self._build_table_data(rows, sheet_name, max_row, max_col)

        return [
            {
                "metadata": {"sheet_name": sheet_name, "sheet_index": 1},
                "text": sheet_text,
                "cells": cells,
                "dimensions": {"max_row": max_row, "max_col": max_col},
            }
        ]

    def _read_excel_sheet(self, sheet) -> List[List[Any]]:
        """Read Excel sheet into list of rows."""
        if not sheet.max_row:
            return []
        rows = []
        scan_limit = min(sheet.max_row, TABLE_MAX_ROWS_TO_SCAN)
        for row in sheet.iter_rows(max_row=scan_limit):
            rows.append([cell.value for cell in row])
        self.logger.info(f"[EXCEL] Read {len(rows)} rows from sheet")
        return rows

    def _read_csv_file(self, file_path: str) -> List[List[str]]:
        """Read CSV file into list of rows (with encoding/delimiter detection)."""
        # Sample for encoding detection (64KB is sufficient for chardet)
        with open(file_path, "rb") as f:
            sample = f.read(65536)

        result = chardet.detect(sample)
        encoding = result["encoding"]

        # Delimiter detection from sample
        sample_text = sample.decode(encoding)
        delimiter = csv.Sniffer().sniff(sample_text[:4096]).delimiter

        # Read with row limit (same as Excel)
        try:
            rows = []
            with open(file_path, "r", encoding=encoding) as f:
                for row in csv.reader(f, delimiter=delimiter):
                    rows.append(row)
                    if len(rows) >= TABLE_MAX_ROWS_TO_SCAN:
                        break
            self.logger.info(
                f"[CSV] Read {len(rows)} rows (encoding={encoding}, delimiter='{delimiter}')"
            )
            return rows
        except (UnicodeDecodeError, LookupError) as e:
            raise ValueError(f"Failed to read CSV: {e}")

    def _get_table_boundaries(self, rows: List[List]) -> tuple[int, int]:
        """Find actual content boundaries, skipping trailing empty rows/columns."""
        max_row = 0
        max_col = 0
        consecutive_empty = 0

        for row_idx, row in enumerate(rows, 1):
            row_has_content = False
            for col_idx, value in enumerate(row, 1):
                if value is not None and str(value).strip():
                    row_has_content = True
                    max_col = max(max_col, col_idx)

            if row_has_content:
                max_row = row_idx
                consecutive_empty = 0
            else:
                consecutive_empty += 1
                if consecutive_empty >= TABLE_EMPTY_ROW_THRESHOLD:
                    break

        self.logger.info(f"[TABLE] Boundaries: {max_row} rows x {max_col} cols")
        return max_row, max_col

    def _build_table_data(
        self, rows: List[List], sheet_name: str, max_row: int, max_col: int
    ) -> Tuple[str, Dict[str, Cell]]:
        """Build pipe-delimited text and cells dict keyed by Excel coordinate."""
        lines: List[str] = []
        cells: Dict[str, Cell] = {}

        if max_row == 0 or max_col == 0:
            lines.append("(Empty sheet)")
        else:
            for row_idx, row in enumerate(rows[:max_row], 1):
                row_values: List[str] = []
                for col_idx in range(max_col):
                    value = row[col_idx] if col_idx < len(row) else None
                    col_letter = self._get_column_letter(col_idx + 1)
                    coord = f"{col_letter}{row_idx}"

                    if value is not None:
                        clean_value = (
                            str(value).replace("\n", " ").replace("\r", " ").strip()
                        )
                        row_values.append(clean_value)
                        if clean_value:
                            cells[coord] = Cell(
                                value=clean_value, row=row_idx, col=col_letter
                            )
                    else:
                        row_values.append("")
                lines.append(" | ".join(row_values))

        self.logger.info(
            f"[TABLE] Built '{sheet_name}': {len(cells)} cells, {len(lines)} text lines"
        )
        return "\n".join(lines), cells

    def _build_table_chunks(self, sheet_data: list, file: File) -> Parse:
        """Build units and token-limited chunks for table documents."""
        content: Dict[str, Unit] = {}
        chunks: List[Chunk] = []
        sheets: Dict[str, Sheet] = {}

        for sheet_info in sheet_data:
            sheet_name = sheet_info["metadata"]["sheet_name"]
            sheet_text = sheet_info["text"]
            cells: Dict[str, Cell] = sheet_info["cells"]
            dims = sheet_info["dimensions"]

            units: List[Unit] = []
            for coord, cell in cells.items():
                unit = Unit(
                    id=coord,
                    type="table",
                    text=cell.value,
                    location=Location(sheet=sheet_name, row=cell.row, col=cell.col),
                )
                units.append(unit)
                content[coord] = unit

            units.sort(key=lambda u: (u.location.row, u.location.col))

            sheet_tokens = len(self.tokenizer.encode(sheet_text))

            sheets[sheet_name] = Sheet(
                cells=cells,
                dimensions=Dimensions(max_row=dims["max_row"], max_col=dims["max_col"]),
                tokens=sheet_tokens,
            )

            if sheet_tokens > TABLE_MAX_TOKENS_PER_CHUNK:
                chunk_units, tokens = self._truncate_units(
                    units, TABLE_MAX_TOKENS_PER_CHUNK
                )
                truncated = True
            else:
                chunk_units = units
                tokens = sheet_tokens
                truncated = False

            chunks.append(
                Chunk(
                    file=file,
                    units=chunk_units,
                    tokens=tokens,
                    slice=Slice(sheet=sheet_name, truncated=truncated),
                )
            )

        return Parse(chunks=chunks, content=content, sheets=sheets)

    def _truncate_units(
        self, units: List[Unit], max_tokens: int
    ) -> Tuple[List[Unit], int]:
        """Truncate units list to fit within token budget."""
        result: List[Unit] = []
        total_tokens = 0

        for unit in units:
            unit_tokens = len(self.tokenizer.encode(unit.text))
            if total_tokens + unit_tokens > max_tokens and result:
                break
            result.append(unit)
            total_tokens += unit_tokens

        return result, total_tokens

    async def analyze_document_metadata(self, content: str, file_name: str) -> Meta:
        """Extract document metadata using AI."""
        try:
            preview = content[:2000] + "..." if len(content) > 2000 else content
            prompt = INTAKE_MINI_PROMPT.format(document_text=preview)

            response = await self.azure_client.chat.completions.create(
                model=SMALL_MODEL_NAME,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": "Analyze this document."},
                ],
                temperature=AI_TEMPERATURE,
                response_format={"type": "json_object"},
            )

            data = json.loads(response.choices[0].message.content)
            return Meta(
                company=data.get("company"),
                ticker=data.get("ticker"),
                doc_type=data.get("doc_type"),
                period_label=data.get("period_label"),
                blurb=data.get("blurb"),
            )

        except Exception as e:
            self.logger.error(f"Metadata extraction failed: {e}")
            return Meta(doc_type="other", blurb=f"Document: {file_name}")

    def _get_column_letter(self, col_num: int) -> str:
        """Convert column number to Excel letter (1=A, 2=B, etc.)."""
        result = ""
        while col_num > 0:
            col_num -= 1
            result = chr(65 + col_num % 26) + result
            col_num //= 26
        return result

    def _read_text_file(self, file_path: str) -> str:
        """Read a text file and return its contents."""
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences using spaCy."""
        doc = self.nlp(text)
        return [sent.text.strip() for sent in doc.sents if sent.text.strip()]

    def _dump_debug(self, file_path: str, result: Parse) -> None:
        """Dump chunking result to JSON for debugging."""
        name = os.path.basename(file_path).replace(" ", "_")
        total_units = sum(len(chunk.units) for chunk in result.chunks)

        self.logger.info(
            f"[BUILD] {len(result.chunks)} chunks, {total_units} units, {len(result.content)} content keys"
        )

        dump_file = DEBUG_DIR / f"{name}_{int(time.time())}.json"
        with open(dump_file, "w") as f:
            json.dump({"file": name, "result": result.model_dump()}, f, indent=2)
        self.logger.info(f"[BUILD] Dumped to {dump_file}")
