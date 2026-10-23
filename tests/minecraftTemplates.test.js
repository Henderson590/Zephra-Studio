const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createMinecraftProject } = require("../app/minecraftProject");
const {
  createMinecraftProjectFiles,
  listMinecraftVersions,
  validateMinecraftProject,
} = require("../app/minecraftTemplates");
const { validateMinecraftPack } = require("../app/minecraftValidator");

function projectOptions(overrides = {}) {
  return {
    type: "data-pack",
    name: "Example Pack",
    namespace: "example_pack",
    description: "A test pack",
    minecraftVersion: "1.21.4",
    destination: "C:\\minecraft-projects",
    ...overrides,
  };
}

test("generates data pack metadata and the 1.21 singular function directory", () => {
  const project = createMinecraftProjectFiles(projectOptions());
  const metadata = JSON.parse(project.files["pack.mcmeta"]);

  assert.equal(project.directoryName, "example-pack");
  assert.equal(metadata.pack.pack_format, 61);
  assert.equal(metadata.pack.description, "A test pack");
  assert.match(
    project.files["data/example_pack/function/hello.mcfunction"],
    /say Hello/,
  );
  assert.equal(
    project.files["data/example_pack/functions/hello.mcfunction"],
    undefined,
  );
});

test("generates a version-specific resource pack with a language file", () => {
  const project = createMinecraftProjectFiles(
    projectOptions({
      type: "resource-pack",
      minecraftVersion: "1.20.1",
    }),
  );

  assert.equal(JSON.parse(project.files["pack.mcmeta"]).pack.pack_format, 15);
  assert.equal(project.files["assets/example_pack/lang/en_us.json"], "{}\n");
  assert.equal(
    project.files["data/example_pack/function/hello.mcfunction"],
    undefined,
  );
});

test("rejects unsupported versions, project types, and invalid namespaces", () => {
  assert.throws(
    () =>
      validateMinecraftProject(projectOptions({ minecraftVersion: "1.22" })),
    /not supported/,
  );
  assert.throws(
    () => validateMinecraftProject(projectOptions({ type: "mod" })),
    /Choose Fabric, Forge, or NeoForge/,
  );
  assert.throws(
    () => validateMinecraftProject(projectOptions({ namespace: "../escape" })),
    /namespace/,
  );
});

test("advertises the supported mod loader and Minecraft version matrix", () => {
  const versions = listMinecraftVersions();
  assert.deepEqual(
    versions.map(({ version, modLoaders }) => ({ version, modLoaders })),
    [
      { version: "1.20.1", modLoaders: ["fabric", "forge"] },
      { version: "1.21.1", modLoaders: ["fabric", "forge", "neoforge"] },
      { version: "1.21.4", modLoaders: [] },
    ],
  );
});

test("generates Fabric and Forge projects for Minecraft 1.20.1", () => {
  for (const modLoader of ["fabric", "forge"]) {
    const project = createMinecraftProjectFiles(
      projectOptions({
        type: "mod",
        modLoader,
        minecraftVersion: "1.20.1",
      }),
    );
    const allFiles = Object.keys(project.files).join("\n");
    const allContent = Object.values(project.files).join("\n");
    assert.equal(project.type, "mod");
    assert.equal(project.modLoader, modLoader);
    assert.match(allFiles, /build\.gradle/);
    assert.match(allFiles, /src\/main\/java\/com\/example\/example_pack/);
    assert.match(project.files["README.md"], /Minecraft: 1\.20\.1/);
    assert.match(project.files["README.md"], /Java: 17/);
    assert.match(project.files["README.md"], /gradle runClientAuth/);
    if (modLoader === "fabric") {
      assert.match(allFiles, /fabric\.mod\.json/);
      assert.match(project.files["gradle.properties"], /1\.20\.1/);
      assert.match(allContent, /net\.fabricmc\.api\.ModInitializer/);
      assert.match(
        project.files["build.gradle"],
        /localRuntime "net\.covers1624:DevLogin:0\.1\.0\.5"/,
      );
      assert.match(
        project.files["build.gradle"],
        /clientAuth\s*\{[\s\S]*mainClass\.set "net\.covers1624\.devlogin\.DevLogin"/,
      );
    } else {
      assert.match(allFiles, /META-INF\/mods\.toml/);
      assert.match(
        project.files["gradle.properties"],
        /forge_version=47\.4\.0/,
      );
      assert.match(allContent, /net\.minecraftforge\.fml\.common\.Mod/);
      assert.match(
        project.files["build.gradle"],
        /runtimeOnly "net\.covers1624:DevLogin:0\.1\.0\.5"/,
      );
      assert.match(
        project.files["build.gradle"],
        /clientAuth\s*\{[\s\S]*net\.covers1624\.devlogin\.DevLogin/,
      );
    }
  }
});

test("generates Fabric, Forge, and NeoForge projects for Minecraft 1.21.1", () => {
  for (const modLoader of ["fabric", "forge", "neoforge"]) {
    const project = createMinecraftProjectFiles(
      projectOptions({
        type: "mod",
        modLoader,
        minecraftVersion: "1.21.1",
        name: 'Example "Mod"',
        description: "A mod's starter",
      }),
    );
    const allFiles = Object.keys(project.files).join("\n");
    const allContent = Object.values(project.files).join("\n");
    assert.equal(project.modLoader, modLoader);
    assert.match(project.files["README.md"], /Minecraft: 1\.21\.1/);
    assert.match(project.files["README.md"], /Java: 21/);
    assert.match(project.files["README.md"], /gradle runClientAuth/);
    assert.match(allFiles, /src\/main\/java\/com\/example\/example_pack/);
    if (modLoader === "fabric") {
      assert.match(allFiles, /fabric\.mod\.json/);
      assert.match(project.files["gradle.properties"], /1\.21\.1/);
      assert.match(
        project.files["build.gradle"],
        /localRuntime "net\.covers1624:DevLogin:0\.1\.0\.5"/,
      );
      assert.match(
        project.files["build.gradle"],
        /clientAuth\s*\{[\s\S]*mainClass\.set "net\.covers1624\.devlogin\.DevLogin"/,
      );
    } else if (modLoader === "forge") {
      assert.match(allFiles, /META-INF\/mods\.toml/);
      assert.match(
        project.files["gradle.properties"],
        /forge_version=52\.0\.16/,
      );
      assert.match(
        project.files["src/main/resources/META-INF/mods.toml"],
        /displayName="Example \\"Mod\\""/,
      );
      assert.match(
        project.files["build.gradle"],
        /runtimeOnly "net\.covers1624:DevLogin:0\.1\.0\.5"/,
      );
      assert.match(
        project.files["build.gradle"],
        /clientAuth\s*\{[\s\S]*net\.covers1624\.devlogin\.DevLogin/,
      );
    } else {
      assert.match(allFiles, /META-INF\/neoforge\.mods\.toml/);
      assert.match(
        project.files["gradle.properties"],
        /neo_version=21\.1\.172/,
      );
      assert.match(
        project.files["build.gradle"],
        /client\s*\{\s*client\(\)\s*\}/,
      );
      assert.match(
        project.files["build.gradle"],
        /id "net\.neoforged\.moddev"/,
      );
      assert.match(
        project.files["build.gradle"],
        /server\s*\{\s*server\(\); programArgument "--nogui" \}/,
      );
      assert.match(
        project.files["build.gradle"],
        /clientAuth\s*\{\s*client\(\)\s*devLogin = true\s*\}/,
      );
    }
  }
});

test("writes a complete starter mod project into a new destination", async (t) => {
  const destination = await fs.mkdtemp(
    path.join(os.tmpdir(), "zephra-minecraft-mod-test-"),
  );
  t.after(() => fs.rm(destination, { recursive: true, force: true }));

  const project = await createMinecraftProject(
    projectOptions({
      type: "mod",
      modLoader: "neoforge",
      minecraftVersion: "1.21.1",
      destination,
    }),
  );
  assert.equal(project.modLoader, "neoforge");
  assert.equal(
    await fs
      .readFile(
        path.join(
          project.path,
          "src",
          "main",
          "resources",
          "META-INF",
          "neoforge.mods.toml",
        ),
        "utf8",
      )
      .then((contents) => contents.includes('modId="example_pack"')),
    true,
  );
  assert.equal(
    await fs
      .readFile(
        path.join(
          project.path,
          "src",
          "main",
          "java",
          "com",
          "example",
          "example_pack",
          "ExamplePackMod.java",
        ),
        "utf8",
      )
      .then((contents) => contents.includes('@Mod("example_pack")')),
    true,
  );
  assert.deepEqual(
    (await fs.readdir(project.path)).sort(),
    [
      "README.md",
      "build.gradle",
      "gradle.properties",
      "settings.gradle",
      "src",
    ].sort(),
  );
});

test("rejects unsupported NeoForge 1.20.1 and invalid mod IDs", () => {
  assert.throws(
    () =>
      validateMinecraftProject(
        projectOptions({
          type: "mod",
          modLoader: "neoforge",
          minecraftVersion: "1.20.1",
        }),
      ),
    /does not have a supported mod template/,
  );
  assert.throws(
    () =>
      validateMinecraftProject(
        projectOptions({
          type: "mod",
          modLoader: "fabric",
          minecraftVersion: "1.20.1",
          namespace: "invalid-mod-id",
        }),
      ),
    /Mod ID must start/,
  );
});

test("requires a project name with a safe output folder name", () => {
  assert.throws(
    () => validateMinecraftProject(projectOptions({ name: "   " })),
    /Enter a project name/,
  );
  assert.throws(
    () => validateMinecraftProject(projectOptions({ name: "!!!" })),
    /ASCII letter or number/,
  );
});

test("creates a complete project atomically under the selected destination", async (t) => {
  const destination = await fs.mkdtemp(
    path.join(os.tmpdir(), "zephra-minecraft-test-"),
  );
  t.after(() => fs.rm(destination, { recursive: true, force: true }));

  const project = await createMinecraftProject(projectOptions({ destination }));
  assert.equal(project.path, path.join(destination, "example-pack"));
  assert.equal(
    await fs.readFile(path.join(project.path, "pack.mcmeta"), "utf8"),
    JSON.stringify(
      { pack: { pack_format: 61, description: "A test pack" } },
      null,
      2,
    ) + "\n",
  );
  assert.equal(
    await fs.readFile(
      path.join(
        project.path,
        "data",
        "example_pack",
        "function",
        "hello.mcfunction",
      ),
      "utf8",
    ),
    "say Hello from Example Pack!\n",
  );
  assert.deepEqual(await fs.readdir(destination), ["example-pack"]);
});

test("refuses to overwrite an existing project and leaves it unchanged", async (t) => {
  const destination = await fs.mkdtemp(
    path.join(os.tmpdir(), "zephra-minecraft-test-"),
  );
  t.after(() => fs.rm(destination, { recursive: true, force: true }));
  const existingProject = path.join(destination, "example-pack");
  await fs.mkdir(existingProject);
  await fs.writeFile(path.join(existingProject, "keep.txt"), "existing data");

  await assert.rejects(
    createMinecraftProject(projectOptions({ destination })),
    /already exists/,
  );
  assert.equal(
    await fs.readFile(path.join(existingProject, "keep.txt"), "utf8"),
    "existing data",
  );
  assert.deepEqual(await fs.readdir(destination), ["example-pack"]);
});

test("validates a generated data pack against its declared target version", async (t) => {
  const destination = await fs.mkdtemp(
    path.join(os.tmpdir(), "zephra-minecraft-validate-"),
  );
  t.after(() => fs.rm(destination, { recursive: true, force: true }));
  const project = await createMinecraftProject(projectOptions({ destination }));

  const result = await validateMinecraftPack(project.path, {
    type: "data-pack",
    minecraftVersion: "1.21.4",
  });

  assert.equal(result.valid, true);
  assert.equal(result.fileCount, 3);
  assert.deepEqual(result.errors, []);
});

test("reports bad metadata, JSON, namespaces, and version-specific function paths", async (t) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "zephra-minecraft-invalid-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(
    path.join(root, "pack.mcmeta"),
    JSON.stringify({ pack: { pack_format: 15, description: "Bad pack" } }),
  );
  await fs.mkdir(path.join(root, "data", "Bad Namespace", "functions"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "data", "Bad Namespace", "functions", "test.mcfunction"),
    "say test\n",
  );
  await fs.mkdir(path.join(root, "assets", "example", "models"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "assets", "example", "models", "invalid.json"),
    "{",
  );

  const result = await validateMinecraftPack(root, {
    type: "data-pack",
    minecraftVersion: "1.21.4",
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Pack format 15")));
  assert.ok(result.errors.some((error) => error.includes("valid namespace")));
  assert.ok(
    result.errors.some((error) => error.includes("expects the function/")),
  );
  assert.ok(result.errors.some((error) => error.includes("invalid JSON")));
  assert.ok(result.warnings.some((warning) => warning.includes("assets/")));
});

test("reports missing pack metadata and rejects unsupported validation options", async (t) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "zephra-minecraft-empty-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = await validateMinecraftPack(root);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Missing required")));
  await assert.rejects(
    validateMinecraftPack(root, { minecraftVersion: "1.22" }),
    /not supported/,
  );
});
