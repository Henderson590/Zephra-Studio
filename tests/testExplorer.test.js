const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { discoverTestTargets } = require("../app/testExplorer");

test("discovers npm scripts, Python unittest directories, and Gradle tests", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zephra-tests-"));
  try {
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        scripts: {
          test: "node --test",
          "test:unit": "node unit.js",
          build: "vite build",
        },
      }),
    );
    await fs.mkdir(path.join(root, "tests"));
    await fs.writeFile(path.join(root, "tests", "test_sample.py"), "");
    await fs.writeFile(path.join(root, "build.gradle"), "");

    const targets = await discoverTestTargets(root);
    assert.deepEqual(
      targets.map((target) => target.id),
      ["npm:test", "npm:test:unit", "python:tests", "gradle:test"],
    );
    assert.equal(
      targets.some((target) => target.id === "npm:build"),
      false,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("surfaces invalid package manifests rather than silently hiding tests", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zephra-tests-"));
  try {
    await fs.writeFile(path.join(root, "package.json"), "{invalid");
    await assert.rejects(discoverTestTargets(root), SyntaxError);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
