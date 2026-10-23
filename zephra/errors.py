"""Error types for the Zephra interpreter."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ZephraError(Exception):
    message: str
    line: int | None = None
    column: int | None = None

    def __str__(self) -> str:
        if self.line is not None and self.column is not None:
            return f"[Line {self.line}, Col {self.column}] {self.message}"
        return self.message


class LexerError(ZephraError):
    pass


class ParseError(ZephraError):
    pass


class RuntimeError(ZephraError):
    stack: list[str] = []

    def __init__(self, message: str, line: int | None = None, column: int | None = None, stack: list[str] | None = None) -> None:
        super().__init__(message, line, column)
        self.stack = stack or []

    def __str__(self) -> str:
        base = super().__str__()
        if self.stack:
            return f"{base}\nStack trace:\n  " + "\n  ".join(self.stack)
        return base
