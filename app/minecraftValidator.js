const fs = require("fs");
const path = require("path");
const { MINECRAFT_VERSIONS } = require("./minecraftTemplates");

const MAX_FILES_TO_SCAN = 5000;
const MAX_JSON_FILE_BYTES = 2 * 1024 * 1024;
const NAMESPACE_PATTERN = /^[a-z0-9_.-]+$/;

async function walkFiles(root, relativeDirectory = "") {
  const absoluteDirectory = path.join(root, relativeDirectory);
  const entries = await fs.promises.readdir(absoluteDirectory, {
    withFileTypes: true,
  });
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
    if (files.length > MAX_FILES_TO_SCAN) {
      throw new Error(`Pack scan exceeded ${MAX_FILES_TO_SCAN} files.`);
    }
  }
  return files;
}

async function validateMinecraftPack(rootPath, options = {}) {
  if (typeof rootPath !== "string" || !rootPath.trim()) {
    throw new Error("Choose a Minecraft pack folder to validate.");
  }
  const root = path.resolve(rootPath);
  const rootStat = await fs.promises.stat(root);
  if (!rootStat.isDirectory()) {
    throw new Error("Minecraft pack path must be a folder.");
  }
  const expectedType = options.type;
  if (
    expectedType !== undefined &&
    !["resource-pack", "data-pack"].includes(expectedType)
  ) {
    throw new Error("Choose a supported resource pack or data pack type.");
  }
  const minecraftVersion = options.minecraftVersion;
  if (minecraftVersion !== undefined && !MINECRAFT_VERSIONS[minecraftVersion]) {
    throw new Error(`Minecraft ${minecraftVersion} is not supported.`);
  }

  const errors = [];
  const warnings = [];
  const files = await walkFiles(root);
  const metadataPath = path.join(root, "pack.mcmeta");
  let metadata;
  try {
    metadata = JSON.parse(await fs.promises.readFile(metadataPath, "utf8"));
  } catch (error) {
    errors.push(
      error.code === "ENOENT"
        ? "Missing required root file pack.mcmeta."
        : `Could not parse pack.mcmeta: ${error.message}`,
    );
  }

  const pack = metadata?.pack;
  if (metadata && (!pack || typeof pack !== "object" || Array.isArray(pack))) {
    errors.push("pack.mcmeta must contain a pack object.");
  }
  if (pack) {
    if (!Number.isInteger(pack.pack_format) || pack.pack_format <= 0) {
      errors.push("pack.mcmeta pack.pack_format must be a positive integer.");
    } else if (minecraftVersion) {
      const formats = MINECRAFT_VERSIONS[minecraftVersion];
      const expectedFormat =
        expectedType === "resource-pack"
          ? formats.resourcePackFormat
          : expectedType === "data-pack"
            ? formats.dataPackFormat
            : null;
      if (expectedFormat && pack.pack_format !== expectedFormat) {
        errors.push(
          `Pack format ${pack.pack_format} does not match the ${expectedType} format ${expectedFormat} for Minecraft ${minecraftVersion}.`,
        );
      }
    }
    if (
      typeof pack.description !== "string" &&
      (typeof pack.description !== "object" ||
        pack.description === null ||
        Array.isArray(pack.description))
    ) {
      errors.push(
        "pack.mcmeta pack.description must be text or a text component.",
      );
    }
  }

  const assetPaths = files.filter((file) =>
    file.split(path.sep).includes("assets"),
  );
  const dataPaths = files.filter((file) =>
    file.split(path.sep).includes("data"),
  );
  let detectedType = expectedType || null;
  if (!detectedType) {
    if (assetPaths.length > 0 && dataPaths.length === 0)
      detectedType = "resource-pack";
    else if (dataPaths.length > 0 && assetPaths.length === 0)
      detectedType = "data-pack";
  }
  if (!detectedType) {
    warnings.push(
      "Could not infer whether this folder is a resource pack or data pack; select a pack type for more specific checks.",
    );
  }

  for (const relativePath of files) {
    const normalized = relativePath.split(path.sep).join("/");
    const pathParts = normalized.split("/");
    for (const [base, expectedPackType] of [
      ["assets", "resource-pack"],
      ["data", "data-pack"],
    ]) {
      const baseIndex = pathParts.indexOf(base);
      if (baseIndex < 0) continue;
      const namespace = pathParts[baseIndex + 1];
      if (!namespace || !NAMESPACE_PATTERN.test(namespace)) {
        errors.push(`${normalized}: ${base}/ paths require a valid namespace.`);
      }
      if (detectedType && expectedPackType !== detectedType) {
        warnings.push(
          `${normalized}: found ${base}/ content in a ${detectedType} validation.`,
        );
      }
    }

    if (normalized.endsWith(".mcfunction")) {
      const dataIndex = pathParts.indexOf("data");
      if (
        dataIndex < 0 ||
        !pathParts[dataIndex + 1] ||
        (pathParts[dataIndex + 2] !== "function" &&
          pathParts[dataIndex + 2] !== "functions")
      ) {
        errors.push(
          `${normalized}: function files must be under data/<namespace>/function(s)/.`,
        );
      }
      if (detectedType === "resource-pack") {
        errors.push(`${normalized}: data functions belong in a data pack.`);
      }
      if (minecraftVersion && dataIndex >= 0) {
        const expectedDirectory =
          MINECRAFT_VERSIONS[minecraftVersion].dataFunctionDirectory;
        const actualDirectory = pathParts[dataIndex + 2];
        if (actualDirectory && actualDirectory !== expectedDirectory) {
          errors.push(
            `${normalized}: Minecraft ${minecraftVersion} expects the ${expectedDirectory}/ function directory.`,
          );
        }
      }
    }

    if (normalized.toLowerCase().endsWith(".json")) {
      const filePath = path.join(root, relativePath);
      try {
        const stat = await fs.promises.stat(filePath);
        if (stat.size > MAX_JSON_FILE_BYTES) {
          warnings.push(
            `${normalized}: skipped JSON validation because the file exceeds 2 MB.`,
          );
          continue;
        }
        JSON.parse(await fs.promises.readFile(filePath, "utf8"));
      } catch (error) {
        errors.push(`${normalized}: invalid JSON (${error.message}).`);
      }
    }
  }

  if (files.length === 0) {
    warnings.push("The selected folder contains no files.");
  }

  return {
    root,
    type: detectedType,
    minecraftVersion: minecraftVersion || null,
    fileCount: files.length,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

module.exports = {
  MAX_FILES_TO_SCAN,
  MAX_JSON_FILE_BYTES,
  validateMinecraftPack,
};
