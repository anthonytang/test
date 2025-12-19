"""Context building from document chunks with line mapping for AI processing."""

import json
import logging
from collections import defaultdict
from typing import List, Dict, Any, Tuple, Optional

from core.config import CONTEXT_MAX_TOKENS, LINE_GAP_THRESHOLD


class Context:
    """Builds context from document chunks for AI processing with citation support."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)

    @staticmethod
    def _col_to_excel(col: int) -> str:
        """Convert 0-based column index to Excel column letter (A, B, ..., Z, AA, AB, ...)"""
        result = ""
        while col >= 0:
            result = chr(65 + (col % 26)) + result
            col = col // 26 - 1
        return result

    def _sort_chunks_by_file_relevance(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Sort chunks: files ordered by max relevance, chunks within files by start_line."""
        if not chunks:
            return []

        # Group by file_id
        file_groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for chunk in chunks:
            file_id = chunk.get('metadata', {}).get('file_id', 'unknown')
            file_groups[file_id].append(chunk)

        # Get max score per file
        file_max_scores = {
            fid: max((c.get('score', 0.0) for c in file_chunks), default=0.0)
            for fid, file_chunks in file_groups.items()
        }

        # Sort files by max score (desc), chunks within file by start_line (asc)
        sorted_chunks = []
        for file_id in sorted(file_groups.keys(), key=lambda f: file_max_scores[f], reverse=True):
            sorted_file_chunks = sorted(
                file_groups[file_id],
                key=lambda x: x.get('metadata', {}).get('start_line', 0)
            )
            sorted_chunks.extend(sorted_file_chunks)

        return sorted_chunks

    def _select_chunks_by_token_budget(self, chunks: List[Dict[str, Any]],
                                       full_excel_map: Dict[str, Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
        """Select chunks that fit within token budget, sorted by relevance."""
        sorted_chunks = sorted(chunks, key=lambda c: c.get('score', 0.0), reverse=True)

        selected = []
        total_tokens = 0

        for chunk in sorted_chunks:
            metadata = chunk.get('metadata', {})
            file_id = metadata.get('file_id')
            sheet_name = metadata.get('sheet_name')

            # Get token count (use full Excel sheet count if truncated)
            if metadata.get('is_truncated') and file_id in full_excel_map:
                sheet_data = full_excel_map[file_id].get(sheet_name, {})
                chunk_tokens = sheet_data.get('token_count', chunk.get('token_count', 1024))
            else:
                chunk_tokens = chunk.get('token_count', 1024)

            if total_tokens + chunk_tokens <= CONTEXT_MAX_TOKENS:
                selected.append(chunk)
                total_tokens += chunk_tokens
            else:
                break

        return selected, total_tokens

    def _build_document_header(self, metadata: Dict[str, Any]) -> List[str]:
        """Build markdown document header optimized for GPT-4o comprehension."""
        file_name = metadata.get('file_name', 'unknown')
        lines = ["", f"### {file_name}"]

        # Build metadata line: **Company (TICKER)** | Type | Period
        parts = []

        company = metadata.get('company', '')
        ticker = metadata.get('ticker', '')
        if company or ticker:
            company_str = f"{company} ({ticker})" if ticker else company
            parts.append(f"**{company_str}**")

        if metadata.get('doc_type'):
            parts.append(metadata['doc_type'])

        if metadata.get('period_label'):
            parts.append(metadata['period_label'])

        if parts:
            lines.append(" | ".join(parts))

        # URL for websites
        if metadata.get('source_url'):
            lines.append(f"URL: {metadata['source_url']}")

        # Document summary
        blurb = metadata.get('blurb', '')
        if blurb:
            lines.extend(["", f"Summary: {blurb}"])

        lines.append("")
        return lines

    def _get_context_change_header(self, start_line: int, sheet_name: Optional[str],
                                   last_end_line: Optional[int],
                                   last_sheet_name: Optional[str]) -> str:
        """Return header text if there's a significant context change."""
        if last_end_line is not None and start_line > last_end_line + LINE_GAP_THRESHOLD:
            return f"--- Continuing from line {start_line} ---"
        if sheet_name and sheet_name != last_sheet_name:
            return f"--- Sheet: {sheet_name} ---"
        return ""

    def _process_excel_row(self, line: str, global_line: int, local_line_num: int,
                           file_id: str, sheet_name: Optional[str]) -> Tuple[List[str], Dict[str, Dict[str, Any]], int]:
        """Process an Excel row, returning (lines, line_map_entries, next_global_line)."""
        numbered_lines = []
        line_map = {}

        if '|' in line:
            cells = [cell.strip() for cell in line.split('|')]

            for col_idx, cell_value in enumerate(cells):
                if not cell_value:
                    continue

                col_letter = self._col_to_excel(col_idx)
                cell_ref = f"{global_line}{col_letter}"

                line_map[cell_ref] = {
                    "text": cell_value,
                    "file_id": file_id,
                    "local_num": local_line_num,
                    "chunk_type": "excel",
                    "sheet_name": sheet_name,
                    "excel_coord": f"{col_letter}{local_line_num}",
                }
                numbered_lines.append(f"[{cell_ref}]: {cell_value}")

            return numbered_lines, line_map, global_line + 1
        else:
            line_map[str(global_line)] = {
                "text": line.strip(),
                "file_id": file_id,
                "local_num": local_line_num,
                "chunk_type": "excel",
                "sheet_name": sheet_name,
            }
            numbered_lines.append(f"[{global_line}] {line.strip()}")
            return numbered_lines, line_map, global_line + 1

    def _process_pdf_line(self, line: str, global_line: int, local_line_num: int,
                          file_id: str) -> Tuple[str, Dict[str, Any]]:
        """Process a PDF line, returning (numbered_line, line_data)."""
        line_data = {
            "text": line.strip(),
            "file_id": file_id,
            "local_num": local_line_num,
            "chunk_type": "pdf",
        }
        return f"[{global_line}] {line.strip()}", line_data

    def _json_table_to_pipe_format(self, json_str: str) -> str:
        """Convert JSON table format to pipe-separated format."""
        try:
            table_data = json.loads(json_str.strip())
            if not isinstance(table_data, dict) or 'rows' not in table_data:
                return json_str

            lines = []
            for row in table_data.get('rows', []):
                cells = row.get('cells', [])
                cell_texts = [
                    cell.get('text', '') if isinstance(cell, dict) else str(cell)
                    for cell in cells
                ]
                lines.append(" | ".join(cell_texts))

            return '\n'.join(lines) if lines else json_str
        except (json.JSONDecodeError, KeyError, TypeError):
            return json_str

    def format_dependent_sections(self, dependent_section_results: List[Dict[str, str]]) -> Optional[str]:
        """Format dependent section results for context. Returns None if no results."""
        if not dependent_section_results:
            return None

        lines = []
        for dep_section in dependent_section_results:
            response = dep_section.get('response').strip()
            if not response:
                continue

            section_type = dep_section.get('section_type')
            if section_type in ('table', 'chart'):
                response = self._json_table_to_pipe_format(response)

            lines.append(f"    • {dep_section['section_name']}:\n{response}")

        return '\n'.join(lines) if lines else None

    def build(self, chunks: List[Dict[str, Any]],
              full_excel_map: Optional[Dict[str, Dict[str, Any]]] = None) -> Tuple[str, Dict[str, Dict[str, Any]]]:
        """Build context string and line map from chunks."""
        if not chunks:
            return "", {}

        full_excel_map = full_excel_map or {}

        # Select chunks within token budget
        selected_chunks, total_tokens = self._select_chunks_by_token_budget(chunks, full_excel_map)
        self.logger.info(f"Selected {len(selected_chunks)}/{len(chunks)} chunks (~{total_tokens} tokens)")

        # Sort for presentation
        sorted_chunks = self._sort_chunks_by_file_relevance(selected_chunks)

        # Build context
        global_line_map = {}
        numbered_lines = []
        global_line = 1
        current_file_id = None
        last_end_line = None
        last_sheet_name = None
        seen_lines: set[tuple] = set()  # Track to skip overlaps

        for chunk in sorted_chunks:
            metadata = chunk.get('metadata', {})
            file_id = metadata.get('file_id', 'unknown')

            # New document header
            if current_file_id != file_id:
                numbered_lines.extend(self._build_document_header(metadata))
                current_file_id = file_id
                last_end_line = last_sheet_name = None

            start_line = int(metadata.get('start_line', 0))
            sheet_name = metadata.get('sheet_name')

            # Context change header
            header = self._get_context_change_header(
                start_line, sheet_name, last_end_line, last_sheet_name
            )
            if header:
                numbered_lines.extend(["", header])

            # Process lines
            chunk_text = metadata.get('text', '')
            chunk_lines = chunk_text.split('\n')
            last_end_line = start_line + len(chunk_lines)
            last_sheet_name = sheet_name

            for i, line in enumerate(chunk_lines):
                if not line.strip():
                    continue

                local_line_num = start_line + i

                # Skip if already added from overlapping chunk
                line_key = (file_id, sheet_name, local_line_num)
                if line_key in seen_lines:
                    continue
                seen_lines.add(line_key)

                is_excel = 'sheet_name' in metadata

                if is_excel:
                    lines, entries, global_line = self._process_excel_row(
                        line, global_line, local_line_num, file_id, sheet_name
                    )
                    numbered_lines.extend(lines)
                    global_line_map.update(entries)
                else:
                    numbered_line, line_data = self._process_pdf_line(
                        line, global_line, local_line_num, file_id
                    )
                    numbered_lines.append(numbered_line)
                    global_line_map[str(global_line)] = line_data
                    global_line += 1

        return '\n'.join(numbered_lines), global_line_map
