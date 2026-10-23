const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function runGit(args, cwd) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true,
      maxBuffer: 5 * 1024 * 1024,
    });
    return stdout.replace(/[\r\n]+$/, "");
  } catch (error) {
    const message = error.stderr?.trim() || error.message;
    throw new Error(`Git ${args[0]} failed: ${message}`);
  }
}

async function getRepositoryRoot(inputPath) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new Error("A workspace folder is required for Git operations.");
  }
  const requestedPath = path.resolve(inputPath);
  let stat;
  try {
    stat = await fs.promises.stat(requestedPath);
  } catch {
    throw new Error(`Workspace folder does not exist: ${requestedPath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error("Git workspace must be a folder.");
  }
  const root = await runGit(["rev-parse", "--show-toplevel"], requestedPath);
  return path.resolve(root);
}

function parsePorcelainStatus(output) {
  const records = output.split("\0");
  const files = [];
  for (let index = 0; index < records.length; index += 1) {
    const line = records[index];
    if (!line) continue;
    if (line.length < 4) {
      throw new Error("Git returned an invalid status entry.");
    }
    const indexStatus = line[0];
    const worktreeStatus = line[1];
    if (
      (indexStatus === "R" ||
        indexStatus === "C" ||
        worktreeStatus === "R" ||
        worktreeStatus === "C") &&
      index + 1 < records.length
    ) {
      index += 1;
    }
    files.push({
      path: line.slice(3),
      status: `${indexStatus}${worktreeStatus}`.trim() || "??",
      staged: indexStatus !== " " && indexStatus !== "?",
      unstaged:
        worktreeStatus !== " " || indexStatus === "?" || worktreeStatus === "?",
    });
  }
  return files;
}

async function getGitStatus(inputPath) {
  const root = await getRepositoryRoot(inputPath);
  const [branch, statusOutput, branchesOutput, remotesOutput] =
    await Promise.all([
      runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], root).catch(() =>
        runGit(["rev-parse", "--short", "HEAD"], root),
      ),
      runGit(["status", "--porcelain=v1", "-z", "--untracked-files=all"], root),
      runGit(["branch", "--format=%(refname:short)"], root),
      runGit(["remote"], root),
    ]);
  const files = parsePorcelainStatus(statusOutput);
  return {
    root,
    branch,
    branches: branchesOutput.split(/\r?\n/).filter(Boolean),
    remotes: remotesOutput.split(/\r?\n/).filter(Boolean),
    dirty: files.length > 0,
    files,
    stagedCount: files.filter((file) => file.staged).length,
  };
}

async function validateBranchName(root, branchName) {
  if (typeof branchName !== "string" || !branchName.trim()) {
    throw new Error("Enter a branch name.");
  }
  await runGit(["check-ref-format", "--branch", branchName.trim()], root);
  return branchName.trim();
}

async function validateRemote(root, remoteName) {
  if (typeof remoteName !== "string" || !remoteName.trim()) {
    throw new Error("Choose a configured Git remote.");
  }
  const name = remoteName.trim();
  const remotes = (await runGit(["remote"], root)).split(/\r?\n/);
  if (!remotes.includes(name)) {
    throw new Error(`Git remote "${name}" is not configured.`);
  }
  return name;
}

async function switchGitBranch(inputPath, branchName) {
  const root = await getRepositoryRoot(inputPath);
  const name = await validateBranchName(root, branchName);
  const dirty = await runGit(
    ["status", "--porcelain=v1", "--untracked-files=all"],
    root,
  );
  if (dirty) {
    throw new Error("Commit or stash local changes before switching branches.");
  }
  await runGit(["switch", name], root);
  return getGitStatus(root);
}

async function createGitBranch(inputPath, branchName) {
  const root = await getRepositoryRoot(inputPath);
  const name = await validateBranchName(root, branchName);
  await runGit(["switch", "-c", name], root);
  return getGitStatus(root);
}

async function fetchGitRemote(inputPath, remoteName) {
  const root = await getRepositoryRoot(inputPath);
  const remote = await validateRemote(root, remoteName);
  await runGit(["fetch", "--prune", remote], root);
  return getGitStatus(root);
}

async function pushGitBranch(inputPath, remoteName) {
  const root = await getRepositoryRoot(inputPath);
  const remote = await validateRemote(root, remoteName);
  const branch = await runGit(
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    root,
  ).catch(() => {
    throw new Error("Push requires a named branch; HEAD is detached.");
  });
  await runGit(["push", "--set-upstream", remote, branch], root);
  return getGitStatus(root);
}

async function pullGitBranch(inputPath, remoteName) {
  const root = await getRepositoryRoot(inputPath);
  const remote = await validateRemote(root, remoteName);
  const branch = await runGit(
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    root,
  ).catch(() => {
    throw new Error("Pull requires a named branch; HEAD is detached.");
  });
  const dirty = await runGit(
    ["status", "--porcelain=v1", "--untracked-files=all"],
    root,
  );
  if (dirty) {
    throw new Error("Commit or stash local changes before pulling.");
  }
  await runGit(["pull", "--ff-only", remote, branch], root);
  return getGitStatus(root);
}

function normalizeGitPaths(root, filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new Error("Select at least one changed file.");
  }
  return [
    ...new Set(
      filePaths.map((filePath) => {
        if (typeof filePath !== "string" || !filePath.trim()) {
          throw new Error("Git file paths must be non-empty strings.");
        }
        const absolutePath = path.resolve(root, filePath);
        const relativePath = path.relative(root, absolutePath);
        if (
          relativePath === "" ||
          relativePath === ".." ||
          relativePath.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relativePath)
        ) {
          throw new Error("Git file paths must stay inside the repository.");
        }
        return relativePath;
      }),
    ),
  ];
}

async function stageGitFiles(inputPath, filePaths) {
  const root = await getRepositoryRoot(inputPath);
  const paths = normalizeGitPaths(root, filePaths);
  await runGit(["add", "--", ...paths], root);
  return getGitStatus(root);
}

async function unstageGitFiles(inputPath, filePaths) {
  const root = await getRepositoryRoot(inputPath);
  const paths = normalizeGitPaths(root, filePaths);
  const hasHead = await runGit(["rev-parse", "--verify", "HEAD"], root)
    .then(() => true)
    .catch(() => false);
  if (hasHead) {
    await runGit(["restore", "--staged", "--", ...paths], root);
  } else {
    await runGit(["rm", "--cached", "--ignore-unmatch", "--", ...paths], root);
  }
  return getGitStatus(root);
}

async function commitGitChanges(inputPath, message) {
  const root = await getRepositoryRoot(inputPath);
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Enter a commit message.");
  }
  await runGit(["commit", "-m", message.trim()], root);
  return getGitStatus(root);
}

module.exports = {
  commitGitChanges,
  createGitBranch,
  fetchGitRemote,
  getGitStatus,
  getRepositoryRoot,
  normalizeGitPaths,
  parsePorcelainStatus,
  pullGitBranch,
  pushGitBranch,
  stageGitFiles,
  switchGitBranch,
  unstageGitFiles,
};
