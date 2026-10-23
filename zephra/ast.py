"""AST definitions for Zephra."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, List, Optional


@dataclass
class Node:
    pass


@dataclass
class Program(Node):
    statements: List[Node]


# Statements
@dataclass
class ExprStmt(Node):
    expression: Node


@dataclass
class ImportStmt(Node):
    module: str


@dataclass
class VarDecl(Node):
    name: str
    initializer: Optional[Node]


@dataclass
class FunDecl(Node):
    name: str
    params: List[str]
    body: List[Node]


@dataclass
class ReturnStmt(Node):
    value: Optional[Node]


@dataclass
class IfStmt(Node):
    condition: Node
    then_branch: List[Node]
    else_branch: Optional[List[Node]]


@dataclass
class WhileStmt(Node):
    condition: Node
    body: List[Node]


@dataclass
class ForStmt(Node):
    initializer: Optional[Node]
    condition: Optional[Node]
    increment: Optional[Node]
    body: List[Node]


@dataclass
class BreakStmt(Node):
    pass


@dataclass
class ContinueStmt(Node):
    pass


@dataclass
class BlockStmt(Node):
    statements: List[Node]


# Expressions
@dataclass
class Literal(Node):
    value: Any


@dataclass
class Variable(Node):
    name: str


@dataclass
class Assign(Node):
    name: str
    value: Node


@dataclass
class Binary(Node):
    left: Node
    operator: str
    right: Node


@dataclass
class Unary(Node):
    operator: str
    right: Node


@dataclass
class Logical(Node):
    left: Node
    operator: str
    right: Node


@dataclass
class Call(Node):
    callee: Node
    arguments: List[Node]


@dataclass
class Get(Node):
    object: Node
    name: str


@dataclass
class Grouping(Node):
    expression: Node
