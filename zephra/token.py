"""Token definitions for the Zephra language."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from typing import Any


class TokenType(str, Enum):
    # Single-character tokens
    LEFT_PAREN = "("
    RIGHT_PAREN = ")"
    LEFT_BRACE = "{"
    RIGHT_BRACE = "}"
    COMMA = ","
    DOT = "."
    MINUS = "-"
    PLUS = "+"
    SEMICOLON = ";"
    SLASH = "/"
    STAR = "*"
    PERCENT = "%"

    # One or two character tokens
    BANG = "!"
    BANG_EQUAL = "!="
    EQUAL = "="
    EQUAL_EQUAL = "=="
    GREATER = ">"
    GREATER_EQUAL = ">="
    LESS = "<"
    LESS_EQUAL = "<="

    # Literals
    IDENTIFIER = "IDENTIFIER"
    STRING = "STRING"
    NUMBER = "NUMBER"

    # Keywords
    AND = "and"
    OR = "or"
    IF = "if"
    ELSE = "else"
    TRUE = "true"
    FALSE = "false"
    NULL = "null"
    WHILE = "while"
    FOR = "for"
    LET = "let"
    FN = "fn"
    RETURN = "return"
    BREAK = "break"
    CONTINUE = "continue"
    IMPORT = "import"

    EOF = "EOF"


@dataclass
class Token:
    type: TokenType
    lexeme: str
    literal: Any
    line: int
    column: int

    def __repr__(self) -> str:
        return f"Token({self.type}, {self.lexeme!r}, {self.literal!r}, {self.line}:{self.column})"
