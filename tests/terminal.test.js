const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const os = require("node:os");
const test = require("node:test");
const { getTerminalShell, validateTerminalInput } = require("../app/terminal");

test("uses the configured Windows command interpreter", () => {
  assert.deepEqual(
    getTerminalShell("win32", { ComSpec: "C:\\Windows\\System32\\cmd.exe" }),
    {
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/Q", "/D"],
    },
  );
});

test("uses the configured POSIX shell", () => {
  assert.deepEqual(getTerminalShell("linux", { SHELL: "/bin/zsh" }), {
    command: "/bin/zsh",
    args: [],
  });
});

test("validates terminal input and applies a size limit", () => {
  assert.equal(validateTerminalInput("echo Zephra"), null);
  assert.match(validateTerminalInput(null), /must be text/);
  assert.match(validateTerminalInput("x".repeat(1024 * 1024 + 1)), /1 MB/);
});

test(
  "selected shell executes a command from the workspace directory",
  { timeout: 5000 },
  async () => {
    const { command, args } = getTerminalShell(process.platform, process.env);
    const child = spawn(command, args, {
      cwd: os.tmpdir(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    const exited = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code));
    });
    const script =
      process.platform === "win32"
        ? "echo ZEPHRA_TERMINAL_TEST_OK\r\nexit\r\n"
        : "printf 'ZEPHRA_TERMINAL_TEST_OK\\n'\nexit\n";
    child.stdin.end(script);

    const exitCode = await exited;
    assert.equal(exitCode, 0);
    assert.match(output, /ZEPHRA_TERMINAL_TEST_OK/);
  },
);
