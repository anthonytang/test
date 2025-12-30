"""Similarity scoring for citation matching using embeddings and text analysis."""

import re
import logging
import numpy as np
from dataclasses import dataclass
from typing import List, Optional
from recognizers_number import NumberRecognizer, Culture
from recognizers_number_with_unit import NumberWithUnitRecognizer

from core.config import NUMBER_MATCH_BOOST


@dataclass
class Number:
    """Simple representation of an extracted number"""
    text: str
    value: float
    type: str  # 'number', 'currency', 'percentage'
    unit: Optional[str] = None  # For currency (USD, EUR) or percentage (%)

    def matches(self, other: 'Number', tolerance: float = 0.01) -> bool:
        """Check if two numbers match within tolerance"""
        if self.type != other.type or self.unit != other.unit:
            return False

        # Handle zero values
        if self.value == 0 or other.value == 0:
            return abs(self.value - other.value) < tolerance

        # Relative difference
        rel_diff = abs(self.value - other.value) / max(abs(self.value), abs(other.value))
        return rel_diff <= tolerance


class SimpleNumberExtractor:
    """Minimal wrapper for number extraction"""

    def __init__(self):
        # Just the models we need
        self.number_model = NumberRecognizer(Culture.English).get_number_model()
        self.percentage_model = NumberRecognizer(Culture.English).get_percentage_model()
        self.currency_model = NumberWithUnitRecognizer(Culture.English).get_currency_model()

    def extract(self, text: str) -> List[Number]:
        """Extract all numbers from text"""
        # Apply fix for consecutive currency bug
        text = self._fix_consecutive_currencies(text)

        numbers = []
        seen = set()  # Track positions to avoid duplicates

        # Extract currencies first (highest priority)
        for r in self.currency_model.parse(text):
            pos = (r.start, r.end)
            if pos not in seen:
                value = float(r.resolution['value'])
                # Use ISO currency code (e.g., "USD", "EUR") for consistent matching
                unit = r.resolution.get('isoCurrency')
                numbers.append(Number(r.text, value, 'currency', unit))
                seen.add(pos)

        # Extract percentages
        for r in self.percentage_model.parse(text):
            pos = (r.start, r.end)
            if pos not in seen:
                # Parse percentage value
                val_str = r.resolution['value']
                value = float(val_str.rstrip('%')) if val_str.endswith('%') else float(val_str)
                numbers.append(Number(r.text, value, 'percentage', '%'))
                seen.add(pos)

        # Extract plain numbers (lowest priority)
        for r in self.number_model.parse(text):
            pos = (r.start, r.end)
            if pos not in seen:
                value = float(r.resolution['value'])
                numbers.append(Number(r.text, value, 'number'))
                seen.add(pos)

        return numbers

    def _fix_consecutive_currencies(self, text: str) -> str:
        """Fix Microsoft Recognizers bug with consecutive currency symbols."""
        pattern = r'([$€£¥]\s*[\d,]+(?:\.\d+)?)\s+([$€£¥])'
        while re.search(pattern, text):
            text = re.sub(pattern, r'\1 | \2', text)
        return text

    def count_matches(self, text1: str, text2: str, tolerance: float = 0.01) -> int:
        """Count matching numbers between two texts"""
        nums1 = self.extract(text1)
        nums2 = self.extract(text2)

        match_count = 0
        used = set()

        # Find matches
        for n1 in nums1:
            for i, n2 in enumerate(nums2):
                if i in used:
                    continue

                # Same type and unit?
                if n1.type == n2.type and n1.unit == n2.unit:
                    if n1.matches(n2, tolerance):
                        match_count += 1
                        used.add(i)
                        break

        return match_count


class Similarity:
    """Computes similarity scores between AI responses and cited documents using embeddings."""

    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.number_extractor = SimpleNumberExtractor()

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        try:
            vec1_array = np.array(vec1)
            vec2_array = np.array(vec2)

            dot_product = np.dot(vec1_array, vec2_array)
            norm1 = np.linalg.norm(vec1_array)
            norm2 = np.linalg.norm(vec2_array)

            if norm1 == 0 or norm2 == 0:
                return 0.0

            similarity = dot_product / (norm1 * norm2)
            return float(np.clip(similarity, 0, 1))
        except Exception as e:
            self.logger.error(f"Error computing cosine similarity: {e}")
            return 0.0

    def compute_similarity_scores(self, response_embedding: List[float],
                                  cited_embeddings: List[List[float]],
                                  response_text: str,
                                  cited_texts: List[str]) -> List[float]:
        """Compute similarity scores using embeddings with number matching boost."""
        scores = []

        for i, embedding in enumerate(cited_embeddings):
            # Base cosine similarity
            similarity = self._cosine_similarity(response_embedding, embedding)

            # Add boost for number matches
            try:
                match_count = self.number_extractor.count_matches(response_text, cited_texts[i])
                if match_count > 0:
                    similarity = min(1.0, similarity + (match_count * NUMBER_MATCH_BOOST))
            except Exception:
                pass

            scores.append(float(similarity))

        return scores
