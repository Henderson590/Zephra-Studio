"""Configuration loading for Zephra projects.

Zephra supports a project config file (`zephra.toml` / `.zephra.toml`) that can
control language options, plugin loading, and file extensions.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import tomllib  # Python 3.11+
except ImportError:  # pragma: no cover
    import tomli as tomllib  # type: ignore


DEFAULT_CONFIG = {
    "language_version": "0.2.0",
    "file_extensions": [".zph"],
    "plugins": [],
    "builtins": [],
    "feature_flags": {
        "async": False,
        "imports": True,
    },
}


@dataclass
class ZephraConfig:
    project_root: Path
    language_version: str = "0.2.0"
    file_extensions: List[str] = field(default_factory=lambda: [".zph"])
    plugins: List[str] = field(default_factory=list)
    builtins: List[str] = field(default_factory=list)
    feature_flags: Dict[str, Any] = field(default_factory=lambda: {"async": False, "imports": True})

    @classmethod
    def load(cls, start_path: Optional[Path] = None, config_path: Optional[Path] = None) -> "ZephraConfig":
        start = Path(start_path or Path.cwd())

        if config_path is not None:
            config_path = config_path.expanduser()
            if config_path.is_file():
                project_root = config_path.parent
            else:
                project_root = cls._find_project_root(config_path)
        else:
            project_root = cls._find_project_root(start)
            config_path = project_root / "zephra.toml"
            if not config_path.exists():
                config_path = project_root / ".zephra.toml"

        config = cls(project_root=project_root)
        if config_path and config_path.exists():
            data = tomllib.loads(config_path.read_text(encoding="utf-8"))
            project = data.get("project", {})
            config.language_version = project.get("language_version", config.language_version)
            config.file_extensions = data.get("file_extensions", config.file_extensions)
            config.plugins = data.get("plugins", config.plugins)
            config.builtins = data.get("builtins", config.builtins)
            config.feature_flags = data.get("feature_flags", config.feature_flags)
        return config

    @staticmethod
    def _find_project_root(start: Path) -> Path:
        """Finds the project root by walking up until a config or pyproject exists."""
        current = start.resolve()
        while True:
            if (current / "pyproject.toml").exists() or (current / "zephra.toml").exists() or (current / ".zephra.toml").exists():
                return current
            if current.parent == current:
                return start
            current = current.parent
