"""Standard library functions and modules for Zephra."""

from __future__ import annotations

import json
import math
import os
from typing import Any

from .evaluator import Interpreter


def register_standard_library(interpreter: Interpreter) -> None:
    """Register built-in functions and modules in the Zephra interpreter."""

    # Basic math
    interpreter.register_builtin("sin", lambda x: math.sin(x), 1)
    interpreter.register_builtin("cos", lambda x: math.cos(x), 1)
    interpreter.register_builtin("tan", lambda x: math.tan(x), 1)
    interpreter.register_builtin("sqrt", lambda x: math.sqrt(x), 1)
    interpreter.register_builtin("pow", lambda x, y: math.pow(x, y), 2)
    interpreter.register_builtin("pi", lambda: math.pi, 0)

    # OS utilities
    interpreter.register_builtin("cwd", lambda: os.getcwd(), 0)
    interpreter.register_builtin("listdir", lambda path=".": os.listdir(str(path)), 1)

    # JSON
    interpreter.register_builtin("json_load", lambda s: json.loads(str(s)), 1)
    interpreter.register_builtin("json_dump", lambda v: json.dumps(v), 1)

    # Type helpers
    interpreter.register_builtin("type_of", lambda v: type(v).__name__, 1)
