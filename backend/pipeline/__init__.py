"""Document processing pipeline components."""

from .main import Pipeline
from .search import Search
from .context import Context
from .citations import Citations
from .similarity import Similarity
from .convert import Parse

# Singleton
_parse = None


def get_parse() -> Parse:
    """Get singleton Parse instance."""
    global _parse
    if _parse is None:
        _parse = Parse()
    return _parse
