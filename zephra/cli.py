"""Command-line runner for Zephra programs."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from .config import ZephraConfig
from .errors import ParseError, RuntimeError
from .lexer import Lexer
from .parser import Parser
from .evaluator import Interpreter
from .version import __version__


def _run_source(source: str, filename: str, interpreter: Interpreter) -> None:
    lexer = Lexer(source)
    tokens = lexer.tokenize()
    parser = Parser(tokens)
    program = parser.parse()
    interpreter.interpret(program)


def run_file(path: Path, config: ZephraConfig, verbose: bool) -> None:
    interpreter = Interpreter(config=config, verbose=verbose)
    interpreter.current_dir = path.parent

    try:
        source = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise FileNotFoundError(f"File not found: {path}")

    _run_source(source, str(path), interpreter)


def run_studio_addon(path: Path, config: ZephraConfig, verbose: bool) -> None:
    interpreter = Interpreter(config=config, verbose=verbose)
    interpreter.current_dir = path.parent

    try:
        source = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise FileNotFoundError(f"File not found: {path}")

    _run_source(source, str(path), interpreter)
    print("__ZEPHRA_STUDIO_COMMANDS__" + json.dumps(interpreter.studio_commands))


def repl(config: ZephraConfig, verbose: bool) -> None:
    interpreter = Interpreter(config=config, verbose=verbose)

    print(f"Zephra {__version__} REPL (type 'exit' or 'quit' to leave)")
    while True:
        try:
            line = input("» ")
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if line.strip() in {"exit", "quit"}:
            break
        if not line.strip():
            continue

        try:
            lexer = Lexer(line)
            tokens = lexer.tokenize()
            parser = Parser(tokens)
            program = parser.parse()
            interpreter.interpret(program)
        except ParseError as err:
            print(f"Parse error: {err}")
        except RuntimeError as err:
            print(f"Runtime error: {err}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="zephra")
    parser.add_argument("file", nargs="?", help="Zephra source file to run")
    parser.add_argument("--repl", action="store_true", help="Run interactive REPL")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    parser.add_argument("--config", type=str, help="Path to Zephra config file")
    parser.add_argument(
        "--studio-addon",
        action="store_true",
        help="Run a .zph add-on and emit its registered Zephra Studio commands",
    )
    parser.add_argument("--version", action="store_true", help="Print Zephra version")

    args = parser.parse_args(argv)

    if args.version:
        print(__version__)
        return 0

    config_path = Path(args.config) if args.config else None
    config = ZephraConfig.load(config_path)

    if args.repl or not args.file:
        if args.studio_addon:
            parser.error("--studio-addon requires a source file")
        repl(config, args.verbose)
        return 0

    path = Path(args.file)

    try:
        if args.studio_addon:
            run_studio_addon(path, config, args.verbose)
        else:
            run_file(path, config, args.verbose)
    except FileNotFoundError as err:
        print(err, file=sys.stderr)
        return 1
    except ParseError as err:
        print(f"Parse error: {err}", file=sys.stderr)
        return 65
    except RuntimeError as err:
        print(f"Runtime error: {err}", file=sys.stderr)
        return 70

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
