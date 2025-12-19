"""Citation extraction, grouping, scoring, and mapping for AI responses."""

import re
import logging
import asyncio
from typing import List, Dict, Any, Tuple, Union, Optional, Set

from core.config import AI_TIMEOUT_SECONDS, TAG_PATTERN
from ai import OutputFormat
from clients import get_cosmos_client
from .similarity import Similarity


class Citations:
    """Handles citation extraction, grouping, scoring, and mapping."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.cosmos_client = get_cosmos_client()
        self.similarity = Similarity()

    @staticmethod
    def expand_grouped_tag(tag: str) -> List[str]:
        """Expand a grouped tag into individual tags."""
        if '-' not in tag:
            return [tag]

        parts = tag.split('-')
        if len(parts) != 2:
            return []

        start_part, end_part = parts
        pattern = r'^(\d*)([A-Z]*)$'
        start_match = re.match(pattern, start_part)
        end_match = re.match(pattern, end_part)

        if not (start_match and end_match):
            return []

        start_num, start_letter = start_match.groups()
        end_num, end_letter = end_match.groups()

        # Numeric range: "45-46" → ["45", "46"]
        if start_letter == end_letter and start_num and end_num:
            try:
                start_int, end_int = int(start_num), int(end_num)
                if start_int > end_int:
                    return []
                return [str(i) + start_letter for i in range(start_int, end_int + 1)]
            except ValueError:
                return []

        return []

    @staticmethod
    def _deduplicate_tags(tags: List[str]) -> List[str]:
        """Remove duplicate tags while preserving order."""
        seen = set()
        result = []
        for tag in tags:
            if tag not in seen:
                seen.add(tag)
                result.append(tag)
        return result

    def _find_sequential_groups(self, tags: List[str]) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Find groups of sequential numeric tags."""
        # Extract numeric tags
        tag_nums = []
        for tag in tags:
            try:
                tag_nums.append(int(tag))
            except ValueError:
                continue

        if not tag_nums:
            return [], tags

        # Find sequences
        sorted_tags = sorted(tag_nums)
        groups = []
        current_group = [sorted_tags[0]]

        for i in range(1, len(sorted_tags)):
            if sorted_tags[i] == sorted_tags[i - 1] + 1:
                current_group.append(sorted_tags[i])
            else:
                if len(current_group) > 1:
                    groups.append(current_group)
                current_group = [sorted_tags[i]]

        if len(current_group) > 1:
            groups.append(current_group)

        # Build result
        grouped_tags = []
        used_tags: Set[str] = set()

        for group in groups:
            grouped_tags.append({
                'name': f"{group[0]}-{group[-1]}",
                'tags': [str(t) for t in group]
            })
            used_tags.update(str(t) for t in group)

        individual_tags = [t for t in tags if t not in used_tags]
        return grouped_tags, individual_tags

    def _combine_texts_for_group(self, group_tags: List[str], line_map: Dict[str, Dict[str, Any]]) -> str:
        """Combine text from multiple tags."""
        texts = [line_map[t]['text'] for t in group_tags if t in line_map and 'text' in line_map[t]]
        return '\n'.join(texts)

    def _build_citation_metadata(
            self, tag: str, line_map: Dict[str, Dict[str, Any]],
            is_grouped: bool, display_tag: str,
            combined_text: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Build citation metadata from a tag."""
        if tag not in line_map:
            return None

        metadata = line_map[tag].copy()
        metadata['is_grouped'] = is_grouped
        metadata['display_tag'] = display_tag
        if combined_text:
            metadata['text'] = combined_text
        return metadata

    def parse_response(
            self, raw_response: Union[str, Dict[str, Any]],
            output_format: OutputFormat) -> List[Dict[str, Any]]:
        """Parse raw AI response into structured items with citation tags."""
        if not raw_response:
            return []

        # TABLE/CHART: already parsed dict
        if output_format in (OutputFormat.TABLE, OutputFormat.CHART):
            return [raw_response] if isinstance(raw_response, dict) else []

        # TEXT: parse lines with citation tags
        if not isinstance(raw_response, str) or not raw_response.strip():
            return []

        result = []
        for line in raw_response.strip().split('\n'):
            line = line.strip()
            if not line:
                continue

            tags = re.findall(TAG_PATTERN, line)
            clean_line = re.sub(TAG_PATTERN, '', line)
            clean_line = re.sub(r'\s+', ' ', clean_line).strip()

            if clean_line:
                result.append({"line": clean_line, "tags": tags})

        return result

    def _build_citations_from_tags(
            self, grouped_tags: List[Dict[str, Any]], individual_tags: List[str],
            line_map: Dict[str, Dict[str, Any]], unit_id: str
    ) -> Tuple[List[str], Dict[str, Any], List[str]]:
        """Build cited texts and metadata from grouped and individual tags."""
        cited_texts = []
        cited_line_map = {}
        citation_ids = []

        for group_idx, group in enumerate(grouped_tags):
            group_name = group['name']
            group_tag_list = group['tags']
            combined_text = self._combine_texts_for_group(group_tag_list, line_map)

            if combined_text:
                cited_texts.append(combined_text)
                citation_id = f"group_{group_name}_{group_idx}_{unit_id}"
                metadata = self._build_citation_metadata(
                    group_tag_list[0], line_map, True, group_name, combined_text
                )
                if metadata:
                    cited_line_map[citation_id] = metadata
                    citation_ids.append(citation_id)

        for tag_idx, tag in enumerate(individual_tags):
            if tag in line_map:
                cited_texts.append(line_map[tag]['text'])
                citation_id = f"individual_{tag}_{tag_idx}_{unit_id}"
                metadata = self._build_citation_metadata(tag, line_map, False, tag)
                if metadata:
                    cited_line_map[citation_id] = metadata
                    citation_ids.append(citation_id)

        return cited_texts, cited_line_map, citation_ids

    async def score_unit(
            self, text: str, raw_tags: List[str],
            line_map: Dict[str, Dict[str, Any]], unit_id: str
    ) -> Tuple[List[str], Dict[str, Any]]:
        """Score citations for a single unit (line or cell). Returns (citation_ids, unit_line_map)."""
        if not raw_tags or not text:
            return [], {}

        # Expand and deduplicate tags
        expanded_tags = []
        for tag in raw_tags:
            expanded_tags.extend(self.expand_grouped_tag(tag))
        deduplicated_tags = self._deduplicate_tags(expanded_tags)

        if not deduplicated_tags:
            return [], {}

        # Group sequential tags
        grouped_tags, individual_tags = self._find_sequential_groups(deduplicated_tags)

        # Build citation metadata
        cited_texts, cited_line_map, citation_ids = self._build_citations_from_tags(
            grouped_tags, individual_tags, line_map, unit_id
        )

        if not cited_texts or not self.cosmos_client:
            return citation_ids, {}

        # Get all embeddings in single batch call
        all_texts = [text] + cited_texts
        all_embeddings = await asyncio.wait_for(
            self.cosmos_client.get_embeddings(all_texts),
            timeout=AI_TIMEOUT_SECONDS
        )
        text_embedding = all_embeddings[0]
        cited_embeddings = all_embeddings[1:]

        # Compute similarity: ONE text vs MANY citations
        similarity_scores = self.similarity.compute_similarity_scores(
            text_embedding, cited_embeddings, text, cited_texts
        )

        # Apply scores to metadata
        unit_line_map = {}
        for citation_id, scores in zip(citation_ids, similarity_scores):
            if citation_id in cited_line_map:
                cited_line_map[citation_id].update(scores)
                unit_line_map[citation_id] = cited_line_map[citation_id]

        return citation_ids, unit_line_map

    async def _score_table_item(
            self, item: Dict[str, Any],
            line_map: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Score citations for structured data (table/chart) cells."""
        cells = []
        for row_idx, row in enumerate(item.get('rows', [])):
            for cell_idx, cell in enumerate(row.get('cells', [])):
                cells.append((cell, cell.get('text', ''), cell.get('tags', []), f"{row_idx}_{cell_idx}"))

        results = await asyncio.gather(*[
            self.score_unit(text, tags, line_map, unit_id)
            for _, text, tags, unit_id in cells
        ])

        combined_line_map = {}
        for (cell, _, _, _), (citation_ids, unit_line_map) in zip(cells, results):
            cell['tags'] = citation_ids
            combined_line_map.update(unit_line_map)

        return combined_line_map

    async def _score_text_item(
            self, idx: int, item: Dict[str, Any],
            line_map: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Score citations for a text item."""
        citation_ids, item_line_map = await self.score_unit(
            item['line'], item['tags'], line_map, f"{idx}"
        )
        item['tags'] = citation_ids
        return item_line_map

    async def score_response(
            self, response: List[Dict[str, Any]],
            line_map: Dict[str, Dict[str, Any]],
            output_format: OutputFormat
    ) -> Dict[str, Any]:
        """Score all citations in response items and build final line map."""
        if output_format in (OutputFormat.TABLE, OutputFormat.CHART):
            results = await asyncio.gather(*[
                self._score_table_item(item, line_map) for item in response
            ])
        else:
            results = await asyncio.gather(*[
                self._score_text_item(idx, item, line_map)
                for idx, item in enumerate(response)
            ])

        final_line_map = {}
        for item_line_map in results:
            final_line_map.update(item_line_map)

        return final_line_map
