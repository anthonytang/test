"""Document processing pipeline components."""

from .main import Pipeline
from .search import Search
from .context import Context
from .citations import Citations
from .similarity import Similarity
from .convert import Parser

# Singleton
_parser = None


def get_parser() -> Parser:
    """Get singleton Parser instance."""
    global _parser
    if _parser is None:
        _parser = Parser()
    return _parser
