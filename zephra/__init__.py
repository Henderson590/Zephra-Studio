"""Zephra interpreter package.

Zephra is a simple, beginner-friendly scripting language with modern readable syntax.
This package contains the lexer, parser, AST, runtime, and extensibility system.
"""

from .cli import main
from .version import __version__

__all__ = ["main", "__version__"]
