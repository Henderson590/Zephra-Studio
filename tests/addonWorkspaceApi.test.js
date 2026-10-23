const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  MAX_ADDON_FILE_BYTES,
  readWorkspaceFile,
  writeWorkspaceFile,
} = require("../app/addonWorkspaceApi");

test("limits add-on workspace reads and writes to relative paths under the workspace", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zephra-addon-api-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "source.txt"), "original", "utf8");

  assert.equal(await readWorkspaceFile(root, "source.txt"), "original");
  assert.deepEqual(await writeWorkspaceFile(root, "source.txt", "updated"), {
    success: true,
  });
  assert.equal(
    await fs.readFile(path.join(root, "source.txt"), "utf8"),
    "updated",
  );
  assert.deepEqual(await writeWorkspaceFile(root, "new.txt", "new file"), {
    success: true,
  });
  assert.equal(
    await fs.readFile(path.join(root, "new.txt"), "utf8"),
    "new file",
  );
});

test("rejects absolute paths, traversal, symbolic links, and oversized content", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zephra-addon-api-"));
  const outside = await fs.mkdtemp(
    path.join(os.tmpdir(), "zephra-addon-outside-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, "secret.txt"), "secret", "utf8");
  await fs.symlink(outside, path.join(root, "linked"), "junction");

  await assert.rejects(
    readWorkspaceFile(root, "../secret.txt"),
    /relative to the open workspace/,
  );
  await assert.rejects(
    readWorkspaceFile(root, path.join(outside, "secret.txt")),
    /relative to the open workspace/,
  );
  await assert.rejects(
    readWorkspaceFile(root, "linked/secret.txt"),
    /does not follow symbolic links/,
  );
  await assert.rejects(
    writeWorkspaceFile(root, "large.txt", "x".repeat(MAX_ADDON_FILE_BYTES + 1)),
    /limited to 1 MB/,
  );
  await assert.rejects(
    writeWorkspaceFile(root, "nested/new.txt", "not created"),
    /ENOENT/,
  );
});
