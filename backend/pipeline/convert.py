"""Document parsing and chunking for PDF, Excel, Word, PowerPoint, HTML, and Markdown."""

import os
import time
import logging
import json
import csv
import asyncio
import chardet
from typing import Dict, Any, List

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
)
from ai import INTAKE_MINI_PROMPT


class Parse:
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

    def build_chunks(self, page_data: list, file_path: str) -> Dict[str, Any]:
        """Build chunks with citation mappings from parsed document data."""
        is_table = file_path.lower().endswith(('.xlsx', '.xls', '.csv'))

        if is_table:
            table_file_map, sheet_map, chunks, full_sheets = self._build_table_chunks(page_data)
            return {
                "chunks": chunks,
                "file_map": {},
                "page_map": {},
                "excel_file_map": table_file_map,
                "sheet_map": sheet_map,
                "full_excel_sheets": full_sheets,
            }
        else:
            file_map, page_map, chunks = self._build_text_chunks(page_data)
            return {
                "chunks": chunks,
                "file_map": file_map,
                "page_map": page_map,
                "excel_file_map": {},
                "sheet_map": {},
                "full_excel_sheets": {},
            }

    async def convert_to_markdown(self, file_path: str) -> str:
        """Convert any supported file to markdown text."""
        if not file_path or not os.path.exists(file_path):
            raise ValueError(f"Invalid file path: {file_path}")

        file_ext = file_path.lower()

        if file_ext.endswith('.pdf'):
            file_name = os.path.basename(file_path)
            page_data, _ = await self._parse_pdf(file_path, file_name)
            return "\n\n".join(page["text"] for page in page_data)

        elif file_ext.endswith(('.xlsx', '.xls')):
            sheet_data = await asyncio.to_thread(self.parse_excel_to_sheets, file_path)
            return "\n\n".join(sheet["text"] for sheet in sheet_data)

        elif file_ext.endswith('.csv'):
            sheet_data = await asyncio.to_thread(self.parse_csv_to_sheets, file_path)
            return sheet_data[0]["text"] if sheet_data else ""

        elif file_ext.endswith('.md'):
            return await asyncio.to_thread(self._read_text_file, file_path)

        else:
            result = await asyncio.to_thread(self.markitdown.convert, file_path)
            return result.text_content

    async def parse_document(self, file_path: str, file_name: str) -> tuple[list, str]:
        """Parse document into page_data and intake_content for metadata analysis."""
        if not file_path or not os.path.exists(file_path):
            raise ValueError(f"Invalid file path: {file_path}")

        ext = file_path.lower()

        if ext.endswith('.pdf'):
            return await self._parse_pdf(file_path, file_name)

        elif ext.endswith(('.xlsx', '.xls', '.csv')):
            if ext.endswith('.csv'):
                sheet_data = await asyncio.to_thread(self.parse_csv_to_sheets, file_path)
            else:
                sheet_data = await asyncio.to_thread(self.parse_excel_to_sheets, file_path)
            intake_content = sheet_data[0]["text"] if sheet_data else ""
            return sheet_data, intake_content

        elif ext.endswith('.md'):
            text_content = await asyncio.to_thread(self._read_text_file, file_path)
            page_data = [{"metadata": {"page": 1}, "text": text_content}]
            return page_data, text_content

        else:
            result = await asyncio.to_thread(self.markitdown.convert, file_path)
            sentences = self._split_into_sentences(result.text_content)
            page_data = [{"metadata": {"page": 1}, "text": '\n'.join(sentences)}]
            return page_data, result.text_content

    async def _parse_pdf(self, file_path: str, file_name: str) -> tuple[list, str]:
        """Parse PDF using Azure Document Intelligence."""
        result = await self.azure_doc_intel_client.analyze_document(file_path)

        page_data = []
        for page_idx, page in enumerate(result.pages, 1):
            lines = [line.content for line in (page.lines or [])]
            page_data.append({
                "metadata": {"page": page_idx},
                "text": "\n".join(lines)
            })

        intake_content = page_data[0]["text"] if page_data else ""
        self.logger.info(f"PDF parsed: {file_name} | {len(page_data)} pages")
        return page_data, intake_content

    def _split_oversized_line(self, text: str) -> List[str]:
        """Split a line that exceeds PARSE_MAX_TOKENS into smaller pieces."""
        tokens = self.tokenizer.encode(text)
        if len(tokens) <= PARSE_MAX_TOKENS:
            return [text]

        pieces = []
        for i in range(0, len(tokens), PARSE_MAX_TOKENS):
            chunk_tokens = tokens[i:i + PARSE_MAX_TOKENS]
            pieces.append(self.tokenizer.decode(chunk_tokens))
        return pieces

    def _build_text_chunks(self, page_data: list) -> tuple[dict, dict, list]:
        """Build line mappings and token-limited chunks with overlap for text documents."""
        file_map = {}
        page_map = {}
        chunks = []

        # Pass 1: Collect all lines with metadata, splitting oversized lines
        all_lines = []
        line_num = 1
        for page_info in page_data:
            page_num = page_info["metadata"]["page"]
            for line in page_info["text"].split('\n'):
                if line.strip():
                    # Split lines that exceed token limit
                    line_pieces = self._split_oversized_line(line)
                    for piece in line_pieces:
                        file_map[line_num] = piece
                        page_map[line_num] = page_num
                        all_lines.append({
                            'text': piece,
                            'line_num': line_num,
                            'tokens': len(self.tokenizer.encode(piece))
                        })
                        line_num += 1

        if not all_lines:
            return file_map, page_map, chunks

        # Pass 2: Build chunks with overlap
        idx = 0
        while idx < len(all_lines):
            chunk_lines = []
            chunk_tokens = 0
            chunk_start_idx = idx

            # Fill chunk to token limit
            while idx < len(all_lines):
                line_info = all_lines[idx]
                if chunk_tokens + line_info['tokens'] > PARSE_MAX_TOKENS and chunk_lines:
                    break
                chunk_lines.append(line_info)
                chunk_tokens += line_info['tokens']
                idx += 1

            # Save chunk
            if chunk_lines:
                chunks.append({
                    'text': '\n'.join(l['text'] for l in chunk_lines),
                    'start_line': chunk_lines[0]['line_num'],
                    'end_line': chunk_lines[-1]['line_num'],
                    'token_count': chunk_tokens
                })

            # Backtrack for overlap (only if more content remains)
            if idx < len(all_lines):
                overlap_tokens = 0
                backtrack_idx = idx
                while backtrack_idx > chunk_start_idx + 1:
                    backtrack_idx -= 1
                    overlap_tokens += all_lines[backtrack_idx]['tokens']
                    if overlap_tokens >= PARSE_OVERLAP_TOKENS:
                        break
                idx = backtrack_idx

        return file_map, page_map, chunks

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
                sheet_text, cell_map = self._build_table_data(rows, sheet_name, max_row, max_col)

                sheet_data.append({
                    "metadata": {"sheet_name": sheet_name, "sheet_index": len(sheet_data) + 1},
                    "text": sheet_text,
                    "cell_map": cell_map
                })
            except Exception as e:
                self.logger.error(f"Error processing sheet '{sheet_name}': {e}")
                continue

        if hasattr(workbook, 'close'):
            workbook.close()

        self.logger.info(f"Excel parsed in {time.time() - start_time:.2f}s: {len(sheet_data)} sheets")

        if not sheet_data:
            raise ValueError("No sheets processed from Excel file")

        return sheet_data

    def parse_csv_to_sheets(self, file_path: str) -> List[Dict[str, Any]]:
        """Parse CSV file into sheet data with text and cell maps."""
        sheet_name = "Data"

        rows = self._read_csv_file(file_path)
        max_row, max_col = self._get_table_boundaries(rows)
        sheet_text, cell_map = self._build_table_data(rows, sheet_name, max_row, max_col)

        return [{
            "metadata": {"sheet_name": sheet_name, "sheet_index": 1},
            "text": sheet_text,
            "cell_map": cell_map
        }]

    def _read_excel_sheet(self, sheet) -> List[List[Any]]:
        """Read Excel sheet into list of rows."""
        rows = []
        scan_limit = min(sheet.max_row or 0, TABLE_MAX_ROWS_TO_SCAN)
        for row in sheet.iter_rows(max_row=scan_limit):
            rows.append([cell.value for cell in row])
        self.logger.info(f"[EXCEL] Read {len(rows)} rows from sheet")
        return rows

    def _read_csv_file(self, file_path: str) -> List[List[str]]:
        """Read CSV file into list of rows (with encoding/delimiter detection)."""
        # Sample for encoding detection (64KB is sufficient for chardet)
        with open(file_path, 'rb') as f:
            sample = f.read(65536)

        result = chardet.detect(sample)
        encoding = result['encoding'] if result.get('confidence', 0) >= 0.7 else 'utf-8'

        # Delimiter detection from sample
        try:
            sample_text = sample.decode(encoding, errors='replace')
            delimiter = csv.Sniffer().sniff(sample_text[:4096]).delimiter
        except (csv.Error, UnicodeDecodeError):
            delimiter = ','

        # Read with row limit (same as Excel)
        try:
            rows = []
            with open(file_path, 'r', encoding=encoding) as f:
                for row in csv.reader(f, delimiter=delimiter):
                    rows.append(row)
                    if len(rows) >= TABLE_MAX_ROWS_TO_SCAN:
                        break
            self.logger.info(f"[CSV] Read {len(rows)} rows (encoding={encoding}, delimiter='{delimiter}')")
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

    def _build_table_data(self, rows: List[List], sheet_name: str, max_row: int, max_col: int) -> tuple[str, Dict[str, Any]]:
        """Build pipe-delimited text and cell coordinate map."""
        lines = []
        cells = {}

        if max_row == 0 or max_col == 0:
            lines.append("(Empty sheet)")
        else:
            for row_idx, row in enumerate(rows[:max_row], 1):
                row_values = []
                for col_idx in range(max_col):
                    value = row[col_idx] if col_idx < len(row) else None
                    if value is not None:
                        clean_value = str(value).replace('\n', ' ').replace('\r', ' ').strip()
                        row_values.append(clean_value)
                        if clean_value:
                            coord = f"{self._get_column_letter(col_idx + 1)}{row_idx}"
                            cells[coord] = {"value": value, "row": row_idx, "col": col_idx + 1, "coord": coord}
                    else:
                        row_values.append("")
                lines.append(" | ".join(row_values))

        cell_map = {
            "sheet_name": sheet_name,
            "dimensions": {"max_row": max_row, "max_col": max_col},
            "cells": cells
        }

        self.logger.info(f"[TABLE] Built '{sheet_name}': {len(cells)} cells, {len(lines)} text lines")
        return '\n'.join(lines), cell_map

    def _build_table_chunks(self, sheet_data: list) -> tuple[dict, dict, list, dict]:
        """Build cell mappings and token-limited chunks for table documents."""
        table_file_map = {}
        sheet_map = {}
        chunks = []
        full_sheets = {}

        for sheet_info in sheet_data:
            sheet_name = sheet_info["metadata"]["sheet_name"]
            sheet_index = sheet_info["metadata"]["sheet_index"]
            sheet_text = sheet_info["text"]
            cell_map = sheet_info["cell_map"]

            table_file_map[sheet_name] = cell_map
            sheet_map[sheet_index] = sheet_name

            sheet_tokens = len(self.tokenizer.encode(sheet_text))
            full_sheets[sheet_name] = {
                "text": sheet_text,
                "cell_map": cell_map,
                "sheet_index": sheet_index,
                "token_count": sheet_tokens
            }

            if sheet_tokens > TABLE_MAX_TOKENS_PER_CHUNK:
                vector_text = self._truncate_to_tokens(sheet_text, TABLE_MAX_TOKENS_PER_CHUNK)
                vector_tokens = TABLE_MAX_TOKENS_PER_CHUNK
                is_truncated = True
            else:
                vector_text = sheet_text
                vector_tokens = sheet_tokens
                is_truncated = False

            chunks.append({
                "text": vector_text,
                "start_line": 1,
                "token_count": vector_tokens,
                "metadata": {
                    "sheet_name": sheet_name,
                    "sheet_index": sheet_index,
                    "is_truncated": is_truncated,
                    "original_token_count": sheet_tokens
                }
            })

        return table_file_map, sheet_map, chunks, full_sheets

    async def analyze_document_metadata(self, content: str, file_name: str) -> Dict[str, Any]:
        """Extract document metadata using AI."""
        try:
            truncated = content[:2000] + "..." if len(content) > 2000 else content
            prompt = INTAKE_MINI_PROMPT.format(document_text=truncated)

            response = await self.azure_client.chat.completions.create(
                model=SMALL_MODEL_NAME,
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": "Analyze this document."}
                ],
                temperature=AI_TEMPERATURE,
                response_format={"type": "json_object"}
            )

            metadata = json.loads(response.choices[0].message.content)
            for field in ["company", "ticker", "doc_type", "period_label", "blurb", "sector"]:
                if field not in metadata:
                    metadata[field] = None
            return metadata

        except Exception as e:
            self.logger.error(f"Metadata extraction failed: {e}")
            return {
                "company": None,
                "ticker": None,
                "doc_type": "other",
                "period_label": None,
                "blurb": f"Document: {file_name}",
                "sector": None
            }

    def _truncate_to_tokens(self, text: str, max_tokens: int) -> str:
        """Truncate text to token limit, preserving complete rows."""
        tokens = self.tokenizer.encode(text)
        if len(tokens) <= max_tokens:
            return text

        truncated = self.tokenizer.decode(tokens[:max_tokens])
        last_newline = truncated.rfind('\n')
        return truncated[:last_newline] if last_newline > 0 else truncated

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
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()

    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences using spaCy."""
        doc = self.nlp(text)
        return [sent.text.strip() for sent in doc.sents if sent.text.strip()]
