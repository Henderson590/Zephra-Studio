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

    def test_rejects_invalid_command_ids_and_oversized_fields(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "command ID"):
            run_source('studio_command("../escape", "Label", "notify", "value");')
        with self.assertRaisesRegex(RuntimeError, "label cannot exceed"):
            run_source(
                f'studio_command("valid.id", "{"x" * 101}", "notify", "value");'
            )
        with self.assertRaisesRegex(RuntimeError, "value cannot exceed"):
            run_source(
                f'studio_command("valid.id", "Label", "notify", "{"x" * 10001}");'
            )

    def test_caps_registered_commands(self) -> None:
        source = "".join(
            f'studio_command("command.{index}", "Command {index}", "notify", "");'
            for index in range(101)
        )
        with self.assertRaisesRegex(RuntimeError, "more than 100 commands"):
            run_source(source)

    def test_sandbox_disables_file_access_and_imports(self) -> None:
        interpreter = Interpreter(
            config=ZephraConfig(project_root=Path.cwd()), sandboxed=True
        )
        with self.assertRaisesRegex(RuntimeError, "Undefined variable 'read_file'"):
            interpreter.interpret(
                Parser(Lexer('read_file("secret.txt");').tokenize()).parse()
            )
        with self.assertRaisesRegex(RuntimeError, "Imports are disabled"):
            interpreter.interpret(
                Parser(Lexer('import "helper.zph";').tokenize()).parse()
            )

    def test_sandbox_enforces_execution_step_limit(self) -> None:
        interpreter = Interpreter(
            config=ZephraConfig(project_root=Path.cwd()),
            sandboxed=True,
            step_limit=20,
        )
        source = "while (true) { }"
        with self.assertRaisesRegex(RuntimeError, "execution step limit"):
            interpreter.interpret(Parser(Lexer(source).tokenize()).parse())

    def test_sandbox_blocks_python_object_introspection_and_large_strings(self) -> None:
        interpreter = Interpreter(
            config=ZephraConfig(project_root=Path.cwd()), sandboxed=True
        )
        with self.assertRaisesRegex(RuntimeError, "property access is disabled"):
            interpreter.interpret(
                Parser(Lexer("print.name;").tokenize()).parse()
            )
        with self.assertRaisesRegex(RuntimeError, "string size limit"):
            interpreter.interpret(
                Parser(Lexer('"x" * 1000001;').tokenize()).parse()
            )


if __name__ == "__main__":
    unittest.main()
