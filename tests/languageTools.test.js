const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { detectLanguageTools, findOnPath } = require("../app/languageTools");

test("finds commands on PATH using Windows extensions and casing", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zephra-tools-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const executable = path.join(directory, "helper.CMD");
  fs.writeFileSync(executable, "");

  assert.equal(
    findOnPath("helper", {
      env: { Path: directory, PATHEXT: ".CMD;.EXE" },
      platform: "win32",
    }),
    executable,
  );
});

test("uses configured executable overrides and reports absent tools", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zephra-tools-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const executable = path.join(
    directory,
    process.platform === "win32" ? "python.exe" : "python",
  );
  fs.writeFileSync(executable, "");
  if (process.platform !== "win32") fs.chmodSync(executable, 0o755);

  const tools = detectLanguageTools(
    { python: executable },
    "missing-default-python",
    { env: { PATH: "" }, platform: process.platform },
  );
  const python = tools.find((tool) => tool.id === "python");
  const pyright = tools.find((tool) => tool.id === "pyright");

  assert.equal(python.available, true);
  assert.equal(python.resolvedPath, executable);
  assert.equal(pyright.available, false);
  assert.equal(pyright.resolvedPath, null);
});

test("does not treat directories as executable tools", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zephra-tools-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  assert.equal(
    findOnPath(directory, { platform: process.platform, env: { PATH: "" } }),
    null,
  );
});

test("discovers a configured Gradle build executable for Minecraft projects", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "zephra-gradle-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const executable = path.join(
    directory,
    process.platform === "win32" ? "gradle.bat" : "gradle",
  );
  fs.writeFileSync(executable, "");
  if (process.platform !== "win32") fs.chmodSync(executable, 0o755);

  const tools = detectLanguageTools(
    { gradle: executable },
    "missing-default-python",
    { env: { PATH: "" }, platform: process.platform },
  );
  const gradle = tools.find((tool) => tool.id === "gradle");

  assert.equal(gradle.available, true);
  assert.equal(gradle.resolvedPath, executable);
});
