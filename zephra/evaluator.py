"""AST evaluator / interpreter for Zephra."""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from .ast import *
from .config import ZephraConfig
from .errors import RuntimeError


# ---------------------------------------------------------------------------
# Runtime Helpers
# ---------------------------------------------------------------------------


def _is_truthy(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return len(value) > 0
    if isinstance(value, (list, dict, set, tuple)):
        return len(value) > 0
    return True


def _is_equal(a: Any, b: Any) -> bool:
    return a == b


def _stringify(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


class ReturnException(Exception):
    def __init__(self, value: Any) -> None:
        self.value = value


class BreakException(Exception):
    pass


class ContinueException(Exception):
    pass


class Environment:
    def __init__(self, enclosing: Optional[Environment] = None) -> None:
        self.enclosing = enclosing
        self.values: Dict[str, Any] = {}

    def define(self, name: str, value: Any) -> None:
        self.values[name] = value

    def get(self, name: str) -> Any:
        if name in self.values:
            return self.values[name]
        if self.enclosing:
            return self.enclosing.get(name)
        raise RuntimeError(f"Undefined variable '{name}'.")

    def assign(self, name: str, value: Any) -> None:
        if name in self.values:
            self.values[name] = value
            return
        if self.enclosing:
            self.enclosing.assign(name, value)
            return
        raise RuntimeError(f"Undefined variable '{name}'.")


@dataclass
class ZephraFunction:
    name: str
    params: List[str]
    body: List[Node]
    closure: Environment

    def call(self, interpreter: Interpreter, arguments: List[Any]) -> Any:
        env = Environment(self.closure)
        for param, arg in zip(self.params, arguments):
            env.define(param, arg)
        interpreter.push_frame(self.name)
        try:
            interpreter._execute_block(self.body, env)
        except ReturnException as r:
            return r.value
        finally:
            interpreter.pop_frame()
        return None

    def arity(self) -> int:
        return len(self.params)

    def __str__(self) -> str:
        return f"<fn {self.name}>"


@dataclass
class ZephraBuiltin:
    name: str
    func: callable
    arity_value: int

    def call(self, interpreter: Interpreter, arguments: List[Any]) -> Any:
        return self.func(*arguments)

    def arity(self) -> int:
        return self.arity_value

    def __str__(self) -> str:
        return f"<builtin {self.name}>"


class Interpreter:
    """The Zephra interpreter.

    The interpreter stores execution state, globals, stack traces, and provides
    extensibility hooks for builtins and modules.
    """

    def __init__(self, config: ZephraConfig | None = None, verbose: bool = False) -> None:
        self.config = config or ZephraConfig.load()
        self.verbose = verbose
        self.globals = Environment()
        self.environment = self.globals
        self.call_stack: List[str] = []
        self.module_cache: Dict[str, Any] = {}
        self.studio_commands: List[Dict[str, str]] = []

        # Base directory for resolving relative imports.
        self.current_dir: Path = Path(self.config.project_root)

        self._define_builtins()

        # Load standard library and plugins if enabled.
        try:
            from .standard_lib import register_standard_library
            from .extensions import load_plugins

            register_standard_library(self)
            load_plugins(self, self.config)
        except Exception:
            # Avoid breaking core interpreter if optional subsystems fail.
            pass

    # Runtime helpers
    def log(self, message: str) -> None:
        if self.verbose:
            print(f"[zephra] {message}")

    def push_frame(self, frame: str) -> None:
        self.call_stack.append(frame)

    def pop_frame(self) -> None:
        if self.call_stack:
            self.call_stack.pop()

    def _build_stack_trace(self) -> List[str]:
        return list(reversed(self.call_stack))

    def register_builtin(self, name: str, func: callable, arity: int = -1) -> None:
        self.globals.define(name, ZephraBuiltin(name, func, arity))

    def register_module(self, name: str, loader: callable) -> None:
        self.module_cache[name] = loader(self)

    def create_child_environment(self) -> Environment:
        return Environment(self.environment)

    def _define_builtins(self) -> None:
        self.globals.define("print", ZephraBuiltin("print", lambda *args: print(*[_stringify(x) for x in args]), -1))
        self.globals.define("input", ZephraBuiltin("input", lambda prompt="": input(str(prompt)), -1))
        self.globals.define("len", ZephraBuiltin("len", lambda x: len(x), 1))
        self.globals.define(
            "read_file",
            ZephraBuiltin(
                "read_file",
                lambda path: open(str(path), "r", encoding="utf-8").read(),
                1,
            ),
        )
        self.globals.define(
            "write_file",
            ZephraBuiltin(
                "write_file",
                lambda path, data: open(str(path), "w", encoding="utf-8").write(str(data)),
                2,
            ),
        )
        self.globals.define(
            "append_file",
            ZephraBuiltin(
                "append_file",
                lambda path, data: open(str(path), "a", encoding="utf-8").write(str(data)),
                2,
            ),
        )
        self.register_builtin("studio_command", self._register_studio_command, 4)

    def _register_studio_command(self, command_id: Any, label: Any, action: Any, value: Any) -> None:
        if not all(isinstance(item, str) for item in (command_id, label, action, value)):
            raise RuntimeError("studio_command expects four string arguments.")
        if not command_id.strip() or not label.strip():
            raise RuntimeError("studio_command requires a non-empty ID and label.")
        if action not in {"notify", "insert_text", "run_current_file"}:
            raise RuntimeError(
                "studio_command action must be 'notify', 'insert_text', or 'run_current_file'."
            )
        if any(command["id"] == command_id for command in self.studio_commands):
            raise RuntimeError(f"Duplicate Studio command ID '{command_id}'.")
        self.studio_commands.append(
            {"id": command_id, "label": label, "action": action, "value": value}
        )

    def interpret(self, program: Program) -> None:
        try:
            for statement in program.statements:
                self._execute(statement)
        except RuntimeError as error:
            # Attach stack trace if missing
            if not getattr(error, "stack", None):
                raise RuntimeError(error.message, error.line, error.column, stack=self._build_stack_trace())
            raise
        except Exception as error:
            # Convert any internal exception into a Zephra runtime error with stack trace.
            raise RuntimeError(str(error), stack=self._build_stack_trace()) from error

    def _execute(self, stmt: Node) -> None:
        method = f"_execute_{type(stmt).__name__}"
        if hasattr(self, method):
            getattr(self, method)(stmt)
        else:
            raise RuntimeError(f"Unknown statement type: {type(stmt).__name__}")

    def _evaluate(self, expr: Node) -> Any:
        method = f"_evaluate_{type(expr).__name__}"
        if hasattr(self, method):
            return getattr(self, method)(expr)
        raise RuntimeError(f"Unknown expression type: {type(expr).__name__}")

    def _execute_BlockStmt(self, stmt: BlockStmt) -> None:
        self._execute_block(stmt.statements, Environment(self.environment))

    def _execute_block(self, statements: List[Node], environment: Environment) -> None:
        previous = self.environment
        try:
            self.environment = environment
            for statement in statements:
                self._execute(statement)
        finally:
            self.environment = previous

    def _execute_ExprStmt(self, stmt: ExprStmt) -> None:
        self._evaluate(stmt.expression)

    def _execute_ImportStmt(self, stmt: "ImportStmt") -> None:
        # Import a module via a file path or module name.
        from .modules import load_module

        module_obj = load_module(stmt.module, self, self.config, self.current_dir)
        name = Path(stmt.module).stem
        self.environment.define(name, module_obj)

    def _execute_VarDecl(self, stmt: VarDecl) -> None:
        value = None
        if stmt.initializer is not None:
            value = self._evaluate(stmt.initializer)
        self.environment.define(stmt.name, value)

    def _execute_FunDecl(self, stmt: FunDecl) -> None:
        function = ZephraFunction(stmt.name, stmt.params, stmt.body, self.environment)
        self.environment.define(stmt.name, function)

    def _execute_ReturnStmt(self, stmt: ReturnStmt) -> None:
        value = None
        if stmt.value is not None:
            value = self._evaluate(stmt.value)
        raise ReturnException(value)

    def _execute_IfStmt(self, stmt: IfStmt) -> None:
        if _is_truthy(self._evaluate(stmt.condition)):
            self._execute_block(stmt.then_branch, Environment(self.environment))
        elif stmt.else_branch is not None:
            self._execute_block(stmt.else_branch, Environment(self.environment))

    def _execute_WhileStmt(self, stmt: WhileStmt) -> None:
        while _is_truthy(self._evaluate(stmt.condition)):
            try:
                self._execute_block(stmt.body, Environment(self.environment))
            except BreakException:
                break
            except ContinueException:
                continue

    def _execute_ForStmt(self, stmt: ForStmt) -> None:
        if stmt.initializer is not None:
            self._execute(stmt.initializer)
        while True:
            if stmt.condition is not None and not _is_truthy(self._evaluate(stmt.condition)):
                break
            try:
                self._execute_block(stmt.body, Environment(self.environment))
            except BreakException:
                break
            except ContinueException:
                pass
            if stmt.increment is not None:
                self._evaluate(stmt.increment)

    def _execute_BreakStmt(self, stmt: BreakStmt) -> None:
        raise BreakException()

    def _execute_ContinueStmt(self, stmt: ContinueStmt) -> None:
        raise ContinueException()

    def _evaluate_Literal(self, expr: Literal) -> Any:
        return expr.value

    def _evaluate_Variable(self, expr: Variable) -> Any:
        return self.environment.get(expr.name)

    def _evaluate_Assign(self, expr: Assign) -> Any:
        value = self._evaluate(expr.value)
        self.environment.assign(expr.name, value)
        return value

    def _evaluate_Binary(self, expr: Binary) -> Any:
        left = self._evaluate(expr.left)
        right = self._evaluate(expr.right)
        op = expr.operator

        if op == "+":
            if isinstance(left, str) or isinstance(right, str):
                return _stringify(left) + _stringify(right)
            return left + right
        if op == "-":
            return left - right
        if op == "*":
            return left * right
        if op == "/":
            return left / right
        if op == "%":
            return left % right
        if op == "==":
            return _is_equal(left, right)
        if op == "!=":
            return not _is_equal(left, right)
        if op == ">":
            return left > right
        if op == ">=":
            return left >= right
        if op == "<":
            return left < right
        if op == "<=":
            return left <= right
        raise RuntimeError(f"Unknown binary operator '{op}'")

    def _evaluate_Unary(self, expr: Unary) -> Any:
        right = self._evaluate(expr.right)
        if expr.operator == "-":
            return -right
        if expr.operator == "!":
            return not _is_truthy(right)
        raise RuntimeError(f"Unknown unary operator '{expr.operator}'")

    def _evaluate_Logical(self, expr: Logical) -> Any:
        left = self._evaluate(expr.left)
        if expr.operator == "or":
            if _is_truthy(left):
                return left
            return self._evaluate(expr.right)
        if expr.operator == "and":
            if not _is_truthy(left):
                return left
            return self._evaluate(expr.right)
        raise RuntimeError(f"Unknown logical operator '{expr.operator}'")

    def _evaluate_Grouping(self, expr: Grouping) -> Any:
        return self._evaluate(expr.expression)

    def _evaluate_Call(self, expr: Call) -> Any:
        callee = self._evaluate(expr.callee)
        arguments = [self._evaluate(arg) for arg in expr.arguments]

        if not hasattr(callee, "call"):
            raise RuntimeError("Can only call functions and built-ins.")

        if hasattr(callee, "arity") and callee.arity() >= 0 and callee.arity() != len(arguments):
            raise RuntimeError(f"Expected {callee.arity()} arguments but got {len(arguments)}.")

        return callee.call(self, arguments)

    def _evaluate_Get(self, expr: "Get") -> Any:
        obj = self._evaluate(expr.object)
        if isinstance(obj, dict):
            if expr.name in obj:
                return obj[expr.name]
            raise RuntimeError(f"Property '{expr.name}' not found on module.")
        if hasattr(obj, expr.name):
            return getattr(obj, expr.name)
        raise RuntimeError(f"Cannot access property '{expr.name}' on value.")


def interpret(program: Program) -> None:
    interpreter = Interpreter()
    interpreter.interpret(program)
