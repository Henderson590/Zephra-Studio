const fs = require("fs");
const path = require("path");

async function discoverTestTargets(rootPath) {
  const root = path.resolve(rootPath);
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  const targets = [];
  const packageFile = entries.find(
    (entry) => entry.isFile() && entry.name === "package.json",
  );

  if (packageFile) {
    const packageJson = JSON.parse(
      await fs.promises.readFile(path.join(root, packageFile.name), "utf8"),
    );
    const scripts = packageJson.scripts;
    if (scripts && typeof scripts === "object" && !Array.isArray(scripts)) {
      for (const name of Object.keys(scripts)) {
        if (name === "test" || /^test[:-][\w-]+$/.test(name)) {
          targets.push({
            id: `npm:${name}`,
            label: `npm run ${name}`,
            runner: "npm",
            script: name,
          });
        }
      }
    }
  }

  const pythonTestDirectories = entries.filter(
    (entry) =>
      entry.isDirectory() &&
      (entry.name === "tests" || entry.name === "test") &&
      /^[\w.-]+$/.test(entry.name),
  );
  for (const directory of pythonTestDirectories) {
    const files = await fs.promises.readdir(path.join(root, directory.name));
    if (files.some((name) => /^test.*\.py$/i.test(name))) {
      targets.push({
        id: `python:${directory.name}`,
        label: `Python unittest (${directory.name})`,
        runner: "python",
        testDirectory: directory.name,
      });
    }
  }

  if (
    entries.some(
      (entry) =>
        entry.isFile() &&
        (entry.name === "build.gradle" || entry.name === "build.gradle.kts"),
    )
  ) {
    targets.push({
      id: "gradle:test",
      label: "Gradle tests",
      runner: "gradle",
    });
  }

  return targets;
}

module.exports = { discoverTestTargets };
