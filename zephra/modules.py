"""Module/import system for Zephra."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

from .config import ZephraConfig
from .evaluator import Interpreter
from .lexer import Lexer
from .parser import Parser
from .errors import ParseError, RuntimeError


class ModuleCache:
    """Cache for loaded modules to avoid re-importing."""

    def __init__(self) -> None:
        self._cache: Dict[str, Any] = {}

    def get(self, name: str) -> Optional[Any]:
        return self._cache.get(name)

    def set(self, name: str, module: Any) -> None:
        self._cache[name] = module


def load_module(name: str, interpreter: Interpreter, config: ZephraConfig, base_path: Path) -> Any:
    """Load a Zephra module by filename or module name."""
    # Modules are either loaded as file paths or from the standard library
    existing = interpreter.module_cache.get(name)
    if existing is not None:
        return existing

    # If name is a path (contains / or \\) or endswith .zph, treat as file.
    candidate = Path(name)
    if not candidate.is_absolute():
        candidate = base_path / name

    if candidate.exists():
        # Load and execute the module file
        try:
            source = candidate.read_text(encoding="utf-8")
        except Exception as e:
            raise RuntimeError(f"Failed to read module '{name}': {e}")

        try:
            lexer = Lexer(source)
            tokens = lexer.tokenize()
            parser = Parser(tokens)
            program = parser.parse()
            module_env = interpreter.create_child_environment()
            # Execute module in its own environment and expose as a module object
            interpreter._execute_block(program.statements, module_env)
            module_obj = {k: v for k, v in module_env.values.items()}
            interpreter.module_cache[name] = module_obj
            return module_obj
        except ParseError as e:
            raise RuntimeError(f"Parse error in module '{name}': {e}")
    
    raise RuntimeError(f"Module not found: {name}")
