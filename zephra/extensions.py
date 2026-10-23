"""Extension/plugin system for Zephra.

Plugins can register built-in functions, standard library modules, and
runtime behavior without modifying core interpreter code.

A plugin is any Python module that exposes a `register(api)` function.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List

from .config import ZephraConfig
from .evaluator import Interpreter


class ExtensionAPI:
    """API exposed to Zephra plugins."""

    def __init__(self, interpreter: Interpreter, config: ZephraConfig) -> None:
        self.interpreter = interpreter
        self.config = config

    def register_builtin(self, name: str, func: Callable[..., Any], arity: int = -1) -> None:
        self.interpreter.register_builtin(name, func, arity)

    def register_module(self, name: str, loader: Callable[[Interpreter], Any]) -> None:
        self.interpreter.register_module(name, loader)

    def log(self, message: str) -> None:
        self.interpreter.log(message)


def _import_module_from_path(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem, str(path))
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load plugin at {path}")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)  # type: ignore
    return module


def load_plugins(interpreter: Interpreter, config: ZephraConfig) -> None:
    """Load plugins specified in config.plugins and from a plugins directory."""
    plugin_paths: List[Path] = []

    # 1) Explicit plugin paths in config
    for p in config.plugins:
        plugin_paths.append(Path(p).expanduser())

    # 2) Default plugins folder in project root
    plugins_dir = config.project_root / "zephra_plugins"
    if plugins_dir.exists() and plugins_dir.is_dir():
        for p in plugins_dir.glob("*.py"):
            plugin_paths.append(p)

    api = ExtensionAPI(interpreter, config)

    for path in plugin_paths:
        try:
            module = _import_module_from_path(path)
            if hasattr(module, "register"):
                module.register(api)
                interpreter.log(f"Loaded plugin: {path.name}")
            else:
                interpreter.log(f"Plugin {path.name} has no register(api) function; skipping.")
        except Exception as e:
            interpreter.log(f"Failed to load plugin {path}: {e}")
