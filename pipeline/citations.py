"""Citation extraction, grouping, scoring, and mapping for AI responses."""

import re
import logging
import asyncio
from typing import List, Dict, Any, Tuple, Union

from core.config import AI_TIMEOUT_SECONDS, TAG_PATTERN
from ai import OutputFormat
from clients import get_cosmos_client
from .similarity import Similarity
from core import Source, Citation, Response, Text, Table, Chart, Item, Row


class Citations:
    """Handles citation extraction, grouping, and scoring."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.cosmos_client = get_cosmos_client()
        self.similarity = Similarity()

    @staticmethod
    def _expand_tag_range(tag: str) -> List[str]:
        """Expand a tag range like '45-47' into ['45', '46', '47']."""
        if "-" not in tag:
            return [tag]

        parts = tag.split("-")
        if len(parts) != 2:
            return []

        try:
            start, end = int(parts[0]), int(parts[1])
            if start > end:
                return []
            return [str(i) for i in range(start, end + 1)]
        except ValueError:
            return []

    @staticmethod
    def _group_sequential(tags: List[str]) -> List[List[str]]:
        """Group sequential numeric tags: ['1','2','3','5'] → [['1','2','3'], ['5']]"""

        # Parse to integers, filter non-numeric
        nums = []
        for t in tags:
            try:
                nums.append(int(t))
            except ValueError:
                continue

        if not nums:
            return [[t] for t in tags]

        # Sort and find sequences
        sorted_nums = sorted(set(nums))
        groups = []
        current = [sorted_nums[0]]

        for i in range(1, len(sorted_nums)):
            if sorted_nums[i] == sorted_nums[i - 1] + 1:
                current.append(sorted_nums[i])
            else:
                groups.append(current)
                current = [sorted_nums[i]]
        groups.append(current)

        return [[str(n) for n in g] for g in groups]

    def parse_response(
        self, raw_response: Union[str, Dict[str, Any]], output_format: OutputFormat
    ) -> Response:
        """Parse raw AI response into typed Response."""

        if output_format == OutputFormat.TEXT:
            return self._parse_text(raw_response)
        elif output_format == OutputFormat.CHART:
            return self._parse_chart(raw_response)
        else:
            return self._parse_table(raw_response)

    def _parse_text(self, raw: Union[str, Dict[str, Any]]) -> Text:
        """Parse text response."""
        if not isinstance(raw, str) or not raw.strip():
            return Text(items=[])

        items = []
        for line in raw.strip().split("\n"):
            line = line.strip()
            if not line:
                continue

            tags = re.findall(TAG_PATTERN, line)
            clean = re.sub(TAG_PATTERN, "", line)
            clean = re.sub(r"\s+", " ", clean).strip()

            if clean:
                items.append(Item(text=clean, tags=tags))

        return Text(items=items)

    def _parse_table(self, raw: Union[str, Dict[str, Any]]) -> Table:
        """Parse table response."""
        if not isinstance(raw, dict) or "rows" not in raw:
            return Table(rows=[])

        rows = [
            Row(
                cells=[Item(text=c["text"], tags=c.get("tags", [])) for c in r["cells"]]
            )
            for r in raw["rows"]
        ]
        return Table(rows=rows)

    def _parse_chart(self, raw: Union[str, Dict[str, Any]]) -> Chart:
        """Parse chart response."""
        if not isinstance(raw, dict) or "rows" not in raw:
            return Chart(rows=[], chart="bar")

        rows = [
            Row(
                cells=[Item(text=c["text"], tags=c.get("tags", [])) for c in r["cells"]]
            )
            for r in raw["rows"]
        ]
        return Chart(rows=rows, chart=raw.get("suggested_chart_type", "bar"))

    def _collect_sources(
        self, group: List[str], sources: Dict[str, Source]
    ) -> List[Source]:
        """Collect sources for a tag group."""
        return [sources[tag] for tag in group if tag in sources]

    async def _score_and_build(
        self, response_text: str, grouped: Dict[str, List[Source]]
    ) -> Dict[str, Citation]:
        """Score source groups and build Citation objects."""
        if not grouped or not self.cosmos_client:
            return {}

        citation_ids = list(grouped.keys())
        cited_texts = [
            "\n".join(s.unit.text for s in sources) for sources in grouped.values()
        ]

        # Get embeddings for response + all citations in one call
        all_texts = [response_text] + cited_texts
        all_embeddings = await asyncio.wait_for(
            self.cosmos_client.get_embeddings(all_texts), timeout=AI_TIMEOUT_SECONDS
        )

        # Compute scores
        scores = self.similarity.compute_similarity_scores(
            all_embeddings[0], all_embeddings[1:], response_text, cited_texts
        )

        # Build Citation objects with scores
        citations = {}
        for cid, sources_list, score in zip(citation_ids, grouped.values(), scores):
            citations[cid] = Citation(
                units=[s.unit for s in sources_list],
                file=sources_list[0].file,
                score=score,
            )

        return citations

    async def score_item(
        self, text: str, raw_tags: List, sources: Dict[str, Source], item_idx: str
    ) -> Tuple[List[str], Dict[str, Citation]]:
        """Score citations for a single response item. Returns (citation_ids, citations)."""
        if not raw_tags or not text:
            return [], {}

        # Expand ranges and deduplicate
        expanded = []
        for tag in raw_tags:
            if tag is not None:
                expanded.extend(self._expand_tag_range(str(tag)))
        tags = list(dict.fromkeys(expanded))  # dedupe preserving order

        if not tags:
            return [], {}

        # Group sequential tags and collect sources
        groups = self._group_sequential(tags)
        grouped: Dict[str, List[Source]] = {}
        citation_ids: List[str] = []

        for idx, group in enumerate(groups):
            sources_list = self._collect_sources(group, sources)
            if sources_list:
                cid = f"c{item_idx}_{idx}"
                grouped[cid] = sources_list
                citation_ids.append(cid)

        # Score and build citations
        citations = await self._score_and_build(text, grouped)

        return citation_ids, citations

    async def score_response(
        self, response: Response, sources: Dict[str, Source]
    ) -> Dict[str, Citation]:
        """Score all citations in response. Updates tags in place, returns citations."""
        if isinstance(response, Text):
            return await self._score_text(response, sources)
        else:
            return await self._score_rows(response.rows, sources)

    async def _score_text(
        self, response: Text, sources: Dict[str, Source]
    ) -> Dict[str, Citation]:
        """Score citations for text response."""
        results = await asyncio.gather(
            *[
                self.score_item(item.text, item.tags, sources, str(idx))
                for idx, item in enumerate(response.items)
            ]
        )

        all_citations: Dict[str, Citation] = {}
        for item, (citation_ids, citations) in zip(response.items, results):
            item.tags = citation_ids
            all_citations.update(citations)

        return all_citations

    async def _score_rows(
        self, rows: List[Row], sources: Dict[str, Source]
    ) -> Dict[str, Citation]:
        """Score citations for table/chart rows."""
        cells = []
        for row_idx, row in enumerate(rows):
            for cell_idx, cell in enumerate(row.cells):
                cells.append((cell, f"{row_idx}_{cell_idx}"))

        results = await asyncio.gather(
            *[
                self.score_item(cell.text, cell.tags, sources, item_idx)
                for cell, item_idx in cells
            ]
        )

        all_citations: Dict[str, Citation] = {}
        for (cell, _), (citation_ids, citations) in zip(cells, results):
            cell.tags = citation_ids
            all_citations.update(citations)

        return all_citations
