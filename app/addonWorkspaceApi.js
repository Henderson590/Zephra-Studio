const fs = require("fs/promises");
const path = require("path");

const MAX_ADDON_FILE_BYTES = 1024 * 1024;

function isPathInside(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

async function resolveWorkspaceFile(rootPath, relativePath, allowMissingFile) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.length > 4096 ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    relativePath
      .split(/[\\/]+/)
      .some(
        (part) =>
          part === ".." ||
          part === "." ||
          /[:.]$| $/.test(part) ||
          /[\u0000-\u001f<>:"|?*]/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(part),
      )
  ) {
    throw new Error(
      "Add-on file paths must be relative to the open workspace.",
    );
  }

  const root = await fs.realpath(rootPath);
  if (!(await fs.stat(root)).isDirectory()) {
    throw new Error("The open workspace path must be a directory.");
  }
  const target = path.resolve(root, relativePath);
  if (!isPathInside(root, target) || target === root) {
    throw new Error("Add-on file path is outside the open workspace.");
  }

  const relative = path.relative(root, target);
  const parts = relative.split(path.sep);
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (
        error.code !== "ENOENT" ||
        !allowMissingFile ||
        index !== parts.length - 1
      ) {
        throw error;
      }
      break;
    }
    if (stat.isSymbolicLink()) {
      throw new Error("Add-on file access does not follow symbolic links.");
    }
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error("Add-on file path contains a non-directory component.");
    }
    if (index === parts.length - 1 && !stat.isFile()) {
      throw new Error("Add-on file path must refer to a regular file.");
    }
  }

  const parent = await fs.realpath(path.dirname(target));
  if (!isPathInside(root, parent)) {
    throw new Error("Add-on file path is outside the open workspace.");
  }
  return target;
}

async function readWorkspaceFile(rootPath, relativePath) {
  const filePath = await resolveWorkspaceFile(rootPath, relativePath, false);
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_ADDON_FILE_BYTES) {
    throw new Error("Add-on workspace reads are limited to 1 MB per file.");
  }
  return fs.readFile(filePath, "utf8");
}

async function writeWorkspaceFile(rootPath, relativePath, contents) {
  if (typeof contents !== "string") {
    throw new Error("Add-on file contents must be text.");
  }
  if (Buffer.byteLength(contents, "utf8") > MAX_ADDON_FILE_BYTES) {
    throw new Error("Add-on workspace writes are limited to 1 MB per file.");
  }
  const filePath = await resolveWorkspaceFile(rootPath, relativePath, true);
  await fs.writeFile(filePath, contents, { encoding: "utf8", flag: "w" });
  return { success: true };
}

module.exports = {
  MAX_ADDON_FILE_BYTES,
  readWorkspaceFile,
  writeWorkspaceFile,
};
