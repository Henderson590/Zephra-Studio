const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const MAX_PROJECT_SNAPSHOT_BYTES = 50 * 1024 * 1024;
const MAX_PROJECT_SNAPSHOT_FILES = 20_000;
const MAX_PROJECT_SNAPSHOT_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_PROJECT_SNAPSHOTS = 5;
const MAX_PROJECT_SNAPSHOT_WORKSPACES = 10;
const MAX_TOTAL_PROJECT_SNAPSHOT_ARCHIVE_BYTES = 250 * 1024 * 1024;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "target",
  "out",
  "coverage",
]);

function snapshotId() {
  return `${Date.now()}-${require("crypto").randomBytes(8).toString("hex")}`;
}

async function collectProjectFiles(rootPath) {
  const root = path.resolve(rootPath);
  const files = [];
  let totalBytes = 0;
  let skippedSymlinks = 0;

  async function visit(directory, relativeDirectory, depth = 0) {
    if (depth > 64) {
      throw new Error("Project snapshot folder nesting exceeds 64 levels.");
    }
    const entries = await fs.promises.readdir(directory, {
      withFileTypes: true,
    });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (entry.isSymbolicLink()) {
        skippedSymlinks += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          await visit(fullPath, relativePath, depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= MAX_PROJECT_SNAPSHOT_FILES) {
        throw new Error(
          `Project snapshot exceeds the ${MAX_PROJECT_SNAPSHOT_FILES}-file limit.`,
        );
      }
      const stat = await fs.promises.stat(fullPath);
      totalBytes += stat.size;
      if (totalBytes > MAX_PROJECT_SNAPSHOT_BYTES) {
        throw new Error("Project snapshot exceeds the 50 MB source limit.");
      }
      files.push({
        path: relativePath.split(path.sep).join("/"),
        contents: (await fs.promises.readFile(fullPath)).toString("base64"),
      });
    }
  }

  await visit(root, "");
  return { files, totalBytes, skippedSymlinks };
}

async function createProjectSnapshot(
  rootPath,
  archivePath,
  label = "",
  id = snapshotId(),
) {
  const root = path.resolve(rootPath);
  const { files, totalBytes, skippedSymlinks } =
    await collectProjectFiles(root);
  const createdAt = new Date().toISOString();
  const manifest = {
    version: 1,
    rootPath: root,
    files,
  };
  const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(manifest)), {
    level: zlib.constants.Z_BEST_COMPRESSION,
  });
  if (compressed.length > MAX_PROJECT_SNAPSHOT_ARCHIVE_BYTES) {
    throw new Error("Compressed project snapshot exceeds the 50 MB limit.");
  }
  const tempPath = `${archivePath}.${id}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });
    await fs.promises.writeFile(tempPath, compressed, { flag: "wx" });
    await fs.promises.rename(tempPath, archivePath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true });
    throw error;
  }

  return {
    id,
    label: typeof label === "string" ? label.trim().slice(0, 120) : "",
    createdAt,
    rootPath: root,
    fileCount: files.length,
    totalBytes,
    archiveBytes: compressed.length,
    skippedSymlinks,
  };
}

function pruneProjectSnapshotStore(snapshotsByWorkspace, rootPath, snapshot) {
  const entries = Object.entries(snapshotsByWorkspace)
    .filter(([root]) => root !== rootPath)
    .map(([root, snapshots]) => [root, [...snapshots]]);
  const current = [...(snapshotsByWorkspace[rootPath] || [])];
  current.unshift(snapshot);
  current.splice(MAX_PROJECT_SNAPSHOTS);
  entries.push([rootPath, current]);
  entries.sort((left, right) => {
    const newest = (snapshots) =>
      Math.max(0, ...snapshots.map((item) => Date.parse(item.createdAt) || 0));
    return newest(right[1]) - newest(left[1]);
  });
  const retained = entries.slice(0, MAX_PROJECT_SNAPSHOT_WORKSPACES);
  let totalBytes = retained.reduce(
    (total, [, snapshots]) =>
      total +
      snapshots.reduce((sum, item) => sum + (item.archiveBytes || 0), 0),
    0,
  );
  while (totalBytes > MAX_TOTAL_PROJECT_SNAPSHOT_ARCHIVE_BYTES) {
    let oldest;
    for (const [root, snapshots] of retained) {
      for (const item of snapshots) {
        if (
          !oldest ||
          Date.parse(item.createdAt) < Date.parse(oldest.item.createdAt)
        ) {
          oldest = { root, item };
        }
      }
    }
    if (!oldest) break;
    const workspace = retained.find(([root]) => root === oldest.root);
    workspace[1] = workspace[1].filter((item) => item.id !== oldest.item.id);
    totalBytes -= oldest.item.archiveBytes || 0;
    if (workspace[1].length === 0) {
      retained.splice(retained.indexOf(workspace), 1);
    }
  }
  return Object.fromEntries(retained);
}

function validateManifest(manifest, expectedRoot) {
  if (
    !manifest ||
    manifest.version !== 1 ||
    path.resolve(manifest.rootPath) !== path.resolve(expectedRoot) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > MAX_PROJECT_SNAPSHOT_FILES
  ) {
    throw new Error("Project snapshot archive has an invalid manifest.");
  }

  let totalBytes = 0;
  const seen = new Set();
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file.path !== "string" ||
      !file.path ||
      typeof file.contents !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        file.contents,
      )
    ) {
      throw new Error("Project snapshot contains an invalid file entry.");
    }
    const segments = file.path.split("/");
    if (
      segments.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === ".." ||
          segment.includes("\\") ||
          segment.includes(":"),
      ) ||
      path.posix.isAbsolute(file.path) ||
      seen.has(file.path)
    ) {
      throw new Error("Project snapshot contains an unsafe or duplicate path.");
    }
    seen.add(file.path);
    totalBytes += Buffer.from(file.contents, "base64").length;
    if (totalBytes > MAX_PROJECT_SNAPSHOT_BYTES) {
      throw new Error("Project snapshot exceeds the 50 MB source limit.");
    }
  }
  return totalBytes;
}

async function restoreProjectSnapshot(archivePath, expectedRoot, targetPath) {
  const archiveStat = await fs.promises.stat(archivePath);
  if (archiveStat.size > MAX_PROJECT_SNAPSHOT_ARCHIVE_BYTES) {
    throw new Error("Project snapshot archive exceeds the 50 MB limit.");
  }
  const compressed = await fs.promises.readFile(archivePath);
  const json = zlib.gunzipSync(compressed, {
    maxOutputLength: MAX_PROJECT_SNAPSHOT_BYTES * 2,
  });
  const manifest = JSON.parse(json.toString("utf8"));
  const totalBytes = validateManifest(manifest, expectedRoot);
  const target = path.resolve(targetPath);
  try {
    await fs.promises.lstat(target);
    throw new Error("Restore destination already exists; choose a new folder.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const parent = path.dirname(target);
  await fs.promises.mkdir(parent, { recursive: true });
  const stage = path.join(parent, `.zephra-restore-${snapshotId()}`);
  await fs.promises.mkdir(stage, { recursive: false });
  try {
    for (const file of manifest.files) {
      const destination = path.resolve(stage, ...file.path.split("/"));
      const relative = path.relative(stage, destination);
      if (
        relative.startsWith(`..${path.sep}`) ||
        relative === ".." ||
        path.isAbsolute(relative)
      ) {
        throw new Error("Project snapshot contains a path outside its root.");
      }
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.writeFile(
        destination,
        Buffer.from(file.contents, "base64"),
        { flag: "wx" },
      );
    }
    await fs.promises.rename(stage, target);
  } catch (error) {
    await fs.promises.rm(stage, { recursive: true, force: true });
    throw error;
  }

  return { path: target, fileCount: manifest.files.length, totalBytes };
}

module.exports = {
  MAX_PROJECT_SNAPSHOT_ARCHIVE_BYTES,
  MAX_PROJECT_SNAPSHOT_BYTES,
  MAX_PROJECT_SNAPSHOT_FILES,
  MAX_PROJECT_SNAPSHOTS,
  MAX_PROJECT_SNAPSHOT_WORKSPACES,
  MAX_TOTAL_PROJECT_SNAPSHOT_ARCHIVE_BYTES,
  collectProjectFiles,
  createProjectSnapshot,
  pruneProjectSnapshotStore,
  restoreProjectSnapshot,
};
