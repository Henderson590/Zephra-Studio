const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  commitGitChanges,
  createGitBranch,
  fetchGitRemote,
  getGitStatus,
  normalizeGitPaths,
  pullGitBranch,
  pushGitBranch,
  stageGitFiles,
  switchGitBranch,
  unstageGitFiles,
} = require("../app/git");

function createRepository(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zephra-git-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Zephra Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "zephra-test@example.invalid"], {
    cwd: root,
  });
  return root;
}

test("reports changed files, including filenames containing spaces", async (context) => {
  const root = createRepository(context);
  fs.writeFileSync(path.join(root, "file with spaces.txt"), "draft");

  const status = await getGitStatus(root);

  assert.equal(path.basename(status.root), path.basename(root));
  assert.equal(status.dirty, true);
  assert.equal(status.stagedCount, 0);
  assert.deepEqual(status.files, [
    {
      path: "file with spaces.txt",
      status: "??",
      staged: false,
      unstaged: true,
    },
  ]);
});

test("stages, unstages, and commits selected files", async (context) => {
  const root = createRepository(context);
  fs.writeFileSync(path.join(root, "first file.txt"), "first");
  fs.writeFileSync(path.join(root, "second.txt"), "second");

  let status = await stageGitFiles(root, ["first file.txt"]);
  assert.equal(status.stagedCount, 1);
  assert.equal(
    status.files.find((file) => file.path === "first file.txt").staged,
    true,
  );
  assert.equal(
    status.files.find((file) => file.path === "second.txt").staged,
    false,
  );

  status = await unstageGitFiles(root, ["first file.txt"]);
  assert.equal(status.stagedCount, 0);

  await stageGitFiles(root, ["first file.txt"]);
  status = await commitGitChanges(root, "test; message remains literal");
  assert.equal(status.dirty, true);
  assert.deepEqual(
    status.files.map((file) => file.path),
    ["second.txt"],
  );
  assert.equal(status.branch.length > 0, true);

  fs.writeFileSync(path.join(root, "first file.txt"), "updated");
  status = await stageGitFiles(root, ["first file.txt"]);
  assert.equal(
    status.files.find((file) => file.path === "first file.txt").staged,
    true,
  );
  status = await unstageGitFiles(root, ["first file.txt"]);
  assert.equal(
    status.files.find((file) => file.path === "first file.txt").staged,
    false,
  );
});

test("rejects invalid or out-of-repository paths and empty commit messages", async (context) => {
  const root = createRepository(context);
  assert.throws(
    () => normalizeGitPaths(root, ["..\\outside.txt"]),
    /inside the repository/,
  );
  await assert.rejects(stageGitFiles(root, []), /Select at least one/);
  await assert.rejects(commitGitChanges(root, "  "), /commit message/);
  await assert.rejects(getGitStatus(os.tmpdir()), /Git .* failed/);
});

test("creates and switches branches without discarding dirty workspace files", async (context) => {
  const root = createRepository(context);
  fs.writeFileSync(path.join(root, "tracked.txt"), "initial");
  execFileSync("git", ["add", "tracked.txt"], { cwd: root });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: root });
  const defaultBranch = execFileSync(
    "git",
    ["symbolic-ref", "--short", "HEAD"],
    { cwd: root, encoding: "utf8" },
  ).trim();

  const created = await createGitBranch(root, "feature/editor-work");
  assert.equal(created.branch, "feature/editor-work");
  assert.ok(created.branches.includes("feature/editor-work"));

  fs.writeFileSync(path.join(root, "tracked.txt"), "local changes");
  await assert.rejects(
    switchGitBranch(root, defaultBranch),
    /Commit or stash local changes/,
  );
  assert.equal(
    fs.readFileSync(path.join(root, "tracked.txt"), "utf8"),
    "local changes",
  );

  execFileSync("git", ["checkout", "--", "tracked.txt"], { cwd: root });
  const switched = await switchGitBranch(root, defaultBranch);
  assert.equal(switched.branch, defaultBranch);
  await assert.rejects(createGitBranch(root, "invalid branch name"), /failed/i);
});

test("fetches, pushes, and fast-forward pulls configured remotes", async (context) => {
  const root = createRepository(context);
  const bareRemote = fs.mkdtempSync(path.join(os.tmpdir(), "zephra-remote-"));
  const peer = fs.mkdtempSync(path.join(os.tmpdir(), "zephra-peer-"));
  context.after(() => fs.rmSync(bareRemote, { recursive: true, force: true }));
  context.after(() => fs.rmSync(peer, { recursive: true, force: true }));

  fs.writeFileSync(path.join(root, "tracked.txt"), "initial\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: root });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: root });
  const defaultBranch = execFileSync(
    "git",
    ["symbolic-ref", "--short", "HEAD"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  execFileSync("git", ["init", "--bare", "--quiet"], { cwd: bareRemote });
  execFileSync("git", ["remote", "add", "origin", bareRemote], { cwd: root });

  let status = await pushGitBranch(root, "origin");
  assert.ok(status.remotes.includes("origin"));
  assert.ok(status.branches.includes(defaultBranch));

  execFileSync("git", ["clone", "--quiet", bareRemote, peer]);
  execFileSync("git", ["config", "user.name", "Zephra Peer"], { cwd: peer });
  execFileSync("git", ["config", "user.email", "peer@example.invalid"], {
    cwd: peer,
  });
  fs.writeFileSync(path.join(peer, "remote.txt"), "remote change\n");
  execFileSync("git", ["add", "remote.txt"], { cwd: peer });
  execFileSync("git", ["commit", "-m", "remote change"], { cwd: peer });
  execFileSync("git", ["push", "origin", "HEAD"], { cwd: peer });

  status = await fetchGitRemote(root, "origin");
  assert.equal(status.dirty, false);
  await assert.rejects(fetchGitRemote(root, "missing"), /not configured/);

  status = await pullGitBranch(root, "origin");
  assert.equal(status.dirty, false);
  assert.equal(
    fs
      .readFileSync(path.join(root, "remote.txt"), "utf8")
      .replace(/\r\n/g, "\n"),
    "remote change\n",
  );

  fs.writeFileSync(path.join(root, "tracked.txt"), "uncommitted\n");
  await assert.rejects(
    pullGitBranch(root, "origin"),
    /Commit or stash local changes/,
  );
  await assert.rejects(pushGitBranch(root, "missing"), /not configured/);
});
