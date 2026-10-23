const fs = require("fs");
const AdmZip = require("adm-zip");

const MAX_VSIX_BYTES = 25 * 1024 * 1024;
const MAX_VSIX_ENTRIES = 5000;
const MAX_VSIX_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_VSIX_CONTRIBUTION_BYTES = 10 * 1024 * 1024;

function normalizeEntryPath(entryName) {
  const normalized = entryName.replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").some((part) => part === "..")
  ) {
    throw new Error("VSIX archive contains an unsafe file path.");
  }
  return normalized
    .split("/")
    .filter((part) => part && part !== ".")
    .join("/");
}

function parseVsixBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_VSIX_BYTES) {
    throw new Error("VSIX files cannot exceed 25 MB.");
  }
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (error) {
    throw new Error(`Could not read VSIX archive: ${String(error)}`);
  }
  const entries = zip.getEntries();
  if (entries.length > MAX_VSIX_ENTRIES) {
    throw new Error(`VSIX archive exceeds ${MAX_VSIX_ENTRIES} entries.`);
  }
  const entryByPath = new Map();
  for (const entry of entries) {
    const entryPath = normalizeEntryPath(entry.entryName);
    if (entryByPath.has(entryPath)) {
      throw new Error(`VSIX archive contains duplicate path '${entryPath}'.`);
    }
    if (entry.header.size > MAX_VSIX_ENTRY_BYTES) {
      throw new Error(`VSIX entry '${entryPath}' exceeds the 5 MB limit.`);
    }
    entryByPath.set(entryPath, entry);
  }

  const packageEntry = entryByPath.get("extension/package.json");
  if (!packageEntry) {
    throw new Error("VSIX is missing extension/package.json.");
  }
  const packageData = packageEntry.getData();
  let manifest;
  try {
    manifest = JSON.parse(packageData.toString("utf8"));
  } catch (error) {
    throw new Error(
      `VSIX extension manifest is invalid JSON: ${String(error)}`,
    );
  }
  if (
    !manifest ||
    typeof manifest.publisher !== "string" ||
    typeof manifest.name !== "string" ||
    typeof manifest.version !== "string" ||
    !/^[A-Za-z0-9._-]+$/.test(manifest.publisher) ||
    !/^[A-Za-z0-9._-]+$/.test(manifest.name)
  ) {
    throw new Error("VSIX extension manifest has invalid identity fields.");
  }
  const contributions = manifest.contributes || {};
  if (
    (Array.isArray(contributions.themes) && contributions.themes.length > 30) ||
    (Array.isArray(contributions.snippets) &&
      contributions.snippets.length > 100)
  ) {
    throw new Error("VSIX has too many theme or snippet contributions.");
  }
  const contentFiles = {};
  let contributionBytes = 0;
  const readContribution = (relativePath) => {
    const normalized = normalizeEntryPath(`extension/${relativePath}`);
    const entry = entryByPath.get(normalized);
    if (!entry || entry.isDirectory) {
      throw new Error(
        `VSIX contribution file '${relativePath}' was not found.`,
      );
    }
    const content = entry.getData();
    contributionBytes += content.length;
    if (contributionBytes > MAX_VSIX_CONTRIBUTION_BYTES) {
      throw new Error("VSIX contribution data exceeds the 10 MB limit.");
    }
    contentFiles[relativePath] = content.toString("utf8");
  };

  const themes = Array.isArray(contributions.themes)
    ? contributions.themes.map((theme) => {
        if (!theme || typeof theme.path !== "string") {
          throw new Error("VSIX theme contribution is invalid.");
        }
        readContribution(theme.path);
        return {
          label:
            typeof theme.label === "string"
              ? theme.label
              : manifest.displayName,
          uiTheme: theme.uiTheme,
          path: theme.path,
        };
      })
    : [];
  const snippets = Array.isArray(contributions.snippets)
    ? contributions.snippets.map((snippet) => {
        if (!snippet || typeof snippet.path !== "string") {
          throw new Error("VSIX snippet contribution is invalid.");
        }
        readContribution(snippet.path);
        return {
          language:
            typeof snippet.language === "string" ? snippet.language : "",
          path: snippet.path,
        };
      })
    : [];
  return {
    id: `${manifest.publisher}.${manifest.name}`,
    name:
      typeof manifest.displayName === "string"
        ? manifest.displayName
        : manifest.name,
    publisher: manifest.publisher,
    version: manifest.version,
    description:
      typeof manifest.description === "string" ? manifest.description : "",
    themes,
    snippets,
    contentFiles,
  };
}

async function readVsix(filePath) {
  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) throw new Error("VSIX path must be a file.");
  if (stat.size > MAX_VSIX_BYTES) {
    throw new Error("VSIX files cannot exceed 25 MB.");
  }
  return parseVsixBuffer(await fs.promises.readFile(filePath));
}

module.exports = {
  MAX_VSIX_BYTES,
  normalizeEntryPath,
  parseVsixBuffer,
  readVsix,
};
