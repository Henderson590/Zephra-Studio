const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const {
  createProjectSnapshot,
  restoreProjectSnapshot,
} = require("../app/projectSnapshots");

test("creates and restores bounded project snapshots while excluding build artifacts", async () => {
  const parent = await fs.mkdtemp(
    path.join(os.tmpdir(), "zephra-project-snapshot-"),
  );
  const root = path.join(parent, "workspace");
  const archivePath = path.join(parent, "archive", "snapshot.zphsnap");
  const restoredPath = path.join(parent, "restored");
  try {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.mkdir(path.join(root, "node_modules", "package"), {
      recursive: true,
    });
    await fs.mkdir(path.join(root, ".git"), { recursive: true });
    await fs.writeFile(
      path.join(root, "src", "main.ts"),
      "export const n = 7;\n",
    );
    await fs.writeFile(path.join(root, "README.md"), "Project\n");
    await fs.writeFile(
      path.join(root, "node_modules", "package", "index.js"),
      "",
    );
    await fs.writeFile(path.join(root, ".git", "config"), "");

    const snapshot = await createProjectSnapshot(
      root,
      archivePath,
      "before change",
    );
    assert.equal(snapshot.fileCount, 2);
    assert.equal(snapshot.label, "before change");
    const restored = await restoreProjectSnapshot(
      archivePath,
      root,
      restoredPath,
    );

    assert.equal(restored.fileCount, 2);
    assert.equal(
      await fs.readFile(path.join(restoredPath, "src", "main.ts"), "utf8"),
      "export const n = 7;\n",
    );
    await assert.rejects(fs.access(path.join(restoredPath, "node_modules")), {
      code: "ENOENT",
    });
    await assert.rejects(
      restoreProjectSnapshot(archivePath, root, restoredPath),
      /already exists/,
    );
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
