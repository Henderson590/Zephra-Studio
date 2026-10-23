const fs = require("fs");
const path = require("path");
const { createMinecraftProjectFiles } = require("./minecraftTemplates");

function isPathInside(directory, candidate) {
  const relativePath = path.relative(
    path.resolve(directory),
    path.resolve(candidate),
  );
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

async function createMinecraftProject(options) {
  let stagingPath;
  try {
    const project = createMinecraftProjectFiles(options);
    const destinationRoot = path.resolve(project.destination);
    const rootStat = await fs.promises.stat(destinationRoot);
    if (!rootStat.isDirectory()) {
      throw new Error("Choose an existing folder as the destination.");
    }

    const targetPath = path.join(destinationRoot, project.directoryName);
    try {
      await fs.promises.access(targetPath);
      throw new Error(
        `A project already exists at ${targetPath}. Choose another destination.`,
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    stagingPath = await fs.promises.mkdtemp(
      path.join(destinationRoot, ".zephra-minecraft-"),
    );
    for (const [relativePath, contents] of Object.entries(project.files)) {
      const filePath = path.join(stagingPath, relativePath);
      if (!isPathInside(stagingPath, filePath)) {
        throw new Error("Template contains an invalid output path.");
      }
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, contents, "utf8");
    }
    await fs.promises.rename(stagingPath, targetPath);
    return {
      path: targetPath,
      type: project.type,
      ...(project.modLoader ? { modLoader: project.modLoader } : {}),
    };
  } catch (error) {
    if (stagingPath) {
      try {
        await fs.promises.rm(stagingPath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(
          `Failed to clean temporary Minecraft project ${stagingPath}:`,
          cleanupError,
        );
      }
    }
    throw error;
  }
}

module.exports = { createMinecraftProject };
