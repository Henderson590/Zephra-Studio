import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from zephra.config import ZephraConfig
from zephra.errors import RuntimeError
from zephra.evaluator import Interpreter
from zephra.lexer import Lexer
from zephra.parser import Parser


def run_source(source: str) -> Interpreter:
    interpreter = Interpreter(config=ZephraConfig(project_root=Path.cwd()))
    interpreter.interpret(Parser(Lexer(source).tokenize()).parse())
    return interpreter


class StudioAddonTests(unittest.TestCase):
    def test_func_keyword_executes_a_zephra_function(self) -> None:
        output = StringIO()
        with redirect_stdout(output):
            run_source('func greet() { print("hello"); } greet();')
        self.assertEqual(output.getvalue().strip(), "hello")

    def test_registers_editor_commands_from_zephra_source(self) -> None:
        interpreter = run_source(
            'studio_command("hello.greet", "Say hello", "notify", "Hello!");'
            'studio_command("hello.insert", "Insert text", "insert_text", "// hello");'
        )

        self.assertEqual(
            interpreter.studio_commands,
            [
                {
                    "id": "hello.greet",
                    "label": "Say hello",
                    "action": "notify",
                    "value": "Hello!",
                },
                {
                    "id": "hello.insert",
                    "label": "Insert text",
                    "action": "insert_text",
                    "value": "// hello",
                },
            ],
        )

    def test_rejects_duplicate_command_ids(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "Duplicate Studio command ID"):
            run_source(
                'studio_command("duplicate", "First", "notify", "one");'
                'studio_command("duplicate", "Second", "notify", "two");'
            )

    def test_rejects_unsupported_editor_actions(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "action must be"):
            run_source('studio_command("unknown", "Unknown", "execute", "value");')


if __name__ == "__main__":
    unittest.main()
