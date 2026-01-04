"""Context building from document chunks with unit-based citation support."""

import json
import logging
from collections import defaultdict
from typing import List, Dict, Tuple, Optional

from core.config import CONTEXT_MAX_TOKENS
from core import (
    Unit,
    Location,
    Match,
    Sheet,
    Cell,
    Source,
    Response,
    Text,
    Row,
)


class Context:
    """Builds context from document chunks for AI processing."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def build(
        self,
        matches: List[Match],
        sheets_map: Optional[Dict[str, Dict[str, Sheet]]] = None,
    ) -> Tuple[str, Dict[str, Source]]:
        """Build context string and sources map from search matches."""
        selected, total_tokens = self._select_chunks(matches, sheets_map)
        self.logger.info(
            f"Selected {len(selected)}/{len(matches)} matches (~{total_tokens} tokens)"
        )

        sorted_matches = self._sort_chunks(selected)

        sources: Dict[str, Source] = {}
        lines: List[str] = []
        current_file: Optional[str] = None
        current_sheet: Optional[str] = None
        seen_local: set = set()
        global_counter = 1

        for match in sorted_matches:
            file = match.file
            sheet_name = match.slice.sheet if match.slice else None

            units = self._get_units(match, sheets_map)
            if not units:
                continue

            if current_file != file.id:
                lines.extend(self._build_header(match))
                current_file = file.id
                current_sheet = None

            if sheet_name and sheet_name != current_sheet:
                lines.extend(["", f"--- Sheet: {sheet_name} ---"])
                current_sheet = sheet_name

            current_row: Optional[int] = None
            for unit in units:
                local_key = (file.id, unit.id)

                if local_key in seen_local:
                    continue
                seen_local.add(local_key)

                is_text = unit.type == "text"

                if is_text:
                    global_id = str(global_counter)
                    global_counter += 1
                else:
                    row = unit.location.row
                    if row != current_row:
                        if current_row is not None:
                            global_counter += 1
                        current_row = row
                    global_id = f"{global_counter}{unit.location.col}"

                lines.append(
                    f"[{global_id}] {unit.text}"
                    if is_text
                    else f"[{global_id}]: {unit.text}"
                )

                sources[global_id] = Source(unit=unit, file=file, meta=match.meta)

        return "\n".join(lines), sources

    def _select_chunks(
        self, matches: List[Match], sheets_map: Optional[Dict[str, Dict[str, Sheet]]]
    ) -> Tuple[List[Match], int]:
        """Select matches within token budget, highest relevance first."""
        sorted_matches = sorted(matches, key=lambda m: m.score, reverse=True)
        selected: List[Match] = []
        total = 0

        for match in sorted_matches:
            tokens = match.tokens

            if match.slice and match.slice.truncated:
                tokens = sheets_map[match.file.id][match.slice.sheet].tokens

            if total + tokens <= CONTEXT_MAX_TOKENS:
                selected.append(match)
                total += tokens
            else:
                break

        return selected, total

    def _sort_chunks(self, matches: List[Match]) -> List[Match]:
        """Sort: files by max relevance, matches within files by position."""
        groups: Dict[str, List[Match]] = defaultdict(list)
        for match in matches:
            groups[match.file.id].append(match)

        max_scores = {aid: max(m.score for m in g) for aid, g in groups.items()}

        result: List[Match] = []
        for file_id in sorted(groups.keys(), key=lambda a: max_scores[a], reverse=True):
            sorted_file = sorted(groups[file_id], key=lambda m: self._match_position(m))
            result.extend(sorted_file)

        return result

    def _match_position(self, match: Match) -> tuple:
        """Get sort position from first unit."""
        if not match.units:
            return (0, "")
        unit = match.units[0]
        if unit.type == "text":
            return (unit.location.page or 0, "")
        return (unit.location.row or 0, unit.location.sheet or "")

    def _get_units(
        self, match: Match, sheets_map: Optional[Dict[str, Dict[str, Sheet]]]
    ) -> List[Unit]:
        """Get units from match, loading full sheet if truncated."""
        if match.slice and match.slice.truncated:
            sheet = sheets_map[match.file.id][match.slice.sheet]
            return self._sheet_to_units(sheet.cells, match.slice.sheet)
        return match.units

    def _sheet_to_units(self, cells: Dict[str, Cell], sheet_name: str) -> List[Unit]:
        """Convert sheet cells to units list."""
        units = [
            Unit(
                id=coord,
                type="table",
                text=cell.value,
                location=Location(sheet=sheet_name, row=cell.row, col=cell.col),
            )
            for coord, cell in cells.items()
        ]
        units.sort(key=lambda u: (u.location.row, u.location.col))
        return units

    def _build_header(self, match: Match) -> List[str]:
        """Build document header."""
        lines = ["", f"### {match.file.name}"]

        parts: List[str] = []
        if match.meta.company or match.meta.ticker:
            company_str = (
                f"{match.meta.company} ({match.meta.ticker})"
                if match.meta.ticker
                else match.meta.company
            )
            parts.append(f"**{company_str}**")
        if match.meta.doc_type:
            parts.append(match.meta.doc_type)
        if match.meta.period_label:
            parts.append(match.meta.period_label)
        if parts:
            lines.append(" | ".join(parts))

        if match.file.name.startswith("http"):
            lines.append(f"URL: {match.file.name}")
        if match.meta.blurb:
            lines.extend(["", f"Summary: {match.meta.blurb}"])

        lines.append("")
        return lines

    # Response formatting utilities

    def format_response(self, response: Response) -> str:
        """Format Response to readable text for analysis."""
        if isinstance(response, Text):
            return "\n".join(item.text for item in response.items if item.text)
        return self._rows_to_pipes(response.rows)

    def format_dependent_sections(
        self, sections: List[Dict[str, str]]
    ) -> Optional[str]:
        """Format dependent section results for context."""
        if not sections:
            return None
        lines = []
        for s in sections:
            resp = s["response"].strip()
            if s["section_type"] in ("table", "chart"):
                resp = self._json_to_pipes(resp)
            lines.append(f"    * {s['section_name']}:\n{resp}")
        return "\n".join(lines)

    def _rows_to_pipes(self, rows: List[Row]) -> str:
        """Convert rows to pipe-separated format."""
        return "\n".join(" | ".join(cell.text for cell in row.cells) for row in rows)

    def _json_to_pipes(self, json_str: str) -> str:
        """Convert JSON table to pipe format."""
        try:
            data = json.loads(json_str.strip())
            return "\n".join(
                " | ".join(c["text"] for c in row["cells"]) for row in data["rows"]
            )
        except (json.JSONDecodeError, KeyError, TypeError):
            return json_str
