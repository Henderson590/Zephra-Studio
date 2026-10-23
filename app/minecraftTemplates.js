const MINECRAFT_VERSIONS = {
  "1.20.1": {
    resourcePackFormat: 15,
    dataPackFormat: 15,
    dataFunctionDirectory: "functions",
    modLoaders: ["fabric", "forge"],
    javaVersion: 17,
    fabric: {
      loaderVersion: "0.16.10",
      fabricApiVersion: "0.92.6+1.20.1",
      yarnMappings: "1.20.1+build.10",
      forgeVersion: "47.4.0",
    },
  },
  "1.21.1": {
    resourcePackFormat: 34,
    dataPackFormat: 48,
    dataFunctionDirectory: "function",
    modLoaders: ["fabric", "forge", "neoforge"],
    javaVersion: 21,
    fabric: {
      loaderVersion: "0.16.10",
      fabricApiVersion: "0.116.6+1.21.1",
      yarnMappings: "1.21.1+build.3",
      forgeVersion: "52.0.16",
      neoForgeVersion: "21.1.172",
    },
  },
  "1.21.4": {
    resourcePackFormat: 46,
    dataPackFormat: 61,
    dataFunctionDirectory: "function",
    modLoaders: [],
  },
};

const MOD_LOADERS = ["fabric", "forge", "neoforge"];

function javaStringLiteral(value) {
  return JSON.stringify(value);
}

function tomlString(value) {
  return JSON.stringify(value);
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateMinecraftProject(options) {
  if (
    !options ||
    !["resource-pack", "data-pack", "mod"].includes(options.type)
  ) {
    throw new Error(
      "Choose a supported resource pack, data pack, or mod project type.",
    );
  }
  if (!MINECRAFT_VERSIONS[options.minecraftVersion]) {
    throw new Error(
      `Minecraft ${options.minecraftVersion} is not supported by these templates.`,
    );
  }
  if (typeof options.name !== "string" || !options.name.trim()) {
    throw new Error("Enter a project name.");
  }
  if (typeof options.destination !== "string" || !options.destination.trim()) {
    throw new Error("Choose a destination folder.");
  }

  const projectName = options.name.trim();
  if (!slugify(projectName)) {
    throw new Error(
      "Project name must contain at least one ASCII letter or number.",
    );
  }
  const namespace = (options.namespace || projectName).trim().toLowerCase();
  if (!namespace || !/^[a-z0-9_.-]+$/.test(namespace)) {
    throw new Error(
      "Enter a namespace using lowercase letters, numbers, periods, underscores, or hyphens.",
    );
  }

  let modLoader = null;
  if (options.type === "mod") {
    if (!MOD_LOADERS.includes(options.modLoader)) {
      throw new Error("Choose Fabric, Forge, or NeoForge for the mod loader.");
    }
    const version = MINECRAFT_VERSIONS[options.minecraftVersion];
    if (!version.modLoaders.includes(options.modLoader)) {
      throw new Error(
        `${options.modLoader} does not have a supported mod template for Minecraft ${options.minecraftVersion}.`,
      );
    }
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(namespace)) {
      throw new Error(
        "Mod ID must start with a lowercase letter and contain 2–64 lowercase letters, numbers, or underscores.",
      );
    }
    modLoader = options.modLoader;
  }

  return {
    type: options.type,
    name: projectName,
    namespace,
    modLoader,
    description:
      typeof options.description === "string" ? options.description.trim() : "",
    minecraftVersion: options.minecraftVersion,
    destination: options.destination,
  };
}

function javaPackageName(namespace) {
  return `com.example.${namespace.replace(/[^a-z0-9_]/g, "_")}`;
}

function javaClassName(name) {
  const words = name.match(/[a-zA-Z0-9]+/g) || [];
  const className = words
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");
  return /^[A-Za-z_$]/.test(className) ? className : `Mod${className}`;
}

function modClassName(name) {
  const baseName = javaClassName(name) || "Example";
  return baseName.endsWith("Mod") ? baseName : `${baseName}Mod`;
}

function createModProjectFiles(project, version) {
  const config = version.fabric;
  const modId = project.namespace;
  const packageName = javaPackageName(modId);
  const className = modClassName(project.name);
  const packagePath = packageName.split(".").join("/");
  const description = project.description || project.name;
  const javaSource = `package ${packageName};

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class ${className} implements net.fabricmc.api.ModInitializer {
    private static final Logger LOGGER = LoggerFactory.getLogger(${javaStringLiteral(modId)});

    @Override
    public void onInitialize() {
        LOGGER.info(${javaStringLiteral(`Loaded ${project.name} for Minecraft ${project.minecraftVersion}.`)});
    }
}
`;

  const files = {
    "settings.gradle": `pluginManagement {
    repositories {
        maven { url = "https://maven.fabricmc.net/" }
        gradlePluginPortal()
    }
}
`,
    "build.gradle": `plugins {
    id "fabric-loom" version "1.9.2"
    id "maven-publish"
}

version = project.mod_version
group = project.maven_group
base {
    archivesName = project.archives_base_name
}

repositories {
    maven { url = "https://maven.covers1624.net/" }
}

dependencies {
    minecraft "com.mojang:minecraft:\${project.minecraft_version}"
    mappings "net.fabricmc:yarn:\${project.yarn_mappings}:v2"
    modImplementation "net.fabricmc:fabric-loader:\${project.loader_version}"
    modImplementation "net.fabricmc.fabric-api:fabric-api:\${project.fabric_api_version}"
    localRuntime "net.covers1624:DevLogin:0.1.0.5"
}

loom {
    runs {
        clientAuth {
            client()
            ideConfigGenerated true
            programArgs "--launch_target", "net.fabricmc.loader.impl.launch.knot.KnotClient"
            mainClass.set "net.covers1624.devlogin.DevLogin"
        }
    }
}

processResources {
    inputs.property "version", project.version
    filesMatching("fabric.mod.json") {
        expand "version": project.version
    }
}

java {
    toolchain.languageVersion = JavaLanguageVersion.of(${version.javaVersion})
    withSourcesJar()
}
`,
    "gradle.properties": `org.gradle.jvmargs=-Xmx2G
org.gradle.parallel=true

minecraft_version=${project.minecraftVersion}
yarn_mappings=${config.yarnMappings}
loader_version=${config.loaderVersion}
fabric_api_version=${config.fabricApiVersion}

mod_version=1.0.0
maven_group=${packageName}
archives_base_name=${modId}
`,
    "src/main/resources/fabric.mod.json": `${JSON.stringify(
      {
        schemaVersion: 1,
        id: modId,
        version: "${version}",
        name: project.name,
        description,
        environment: "*",
        entrypoints: { main: [`${packageName}.${className}`] },
        depends: {
          fabricloader: `>=${config.loaderVersion}`,
          minecraft: `~${project.minecraftVersion}`,
          java: `>=${version.javaVersion}`,
          "fabric-api": "*",
        },
      },
      null,
      2,
    )}\n`,
    [`src/main/java/${packagePath}/${className}.java`]: javaSource,
  };
  return files;
}

function createForgeProjectFiles(project, version) {
  const config = version.fabric;
  const modId = project.namespace;
  const packageName = javaPackageName(modId);
  const className = modClassName(project.name);
  const packagePath = packageName.split(".").join("/");
  const description = project.description || project.name;
  const forgeMajor = config.forgeVersion.split(".")[0];
  const files = {
    "settings.gradle": `pluginManagement {
    repositories {
        maven { url = "https://maven.minecraftforge.net/" }
        gradlePluginPortal()
    }
}
`,
    "build.gradle": `plugins {
    id "eclipse"
    id "idea"
    id "maven-publish"
    id "net.minecraftforge.gradle" version "[6.0,6.2)"
}

group = "${packageName}"
version = "1.0.0"
base {
    archivesName = "${modId}"
}

java.toolchain.languageVersion = JavaLanguageVersion.of(${version.javaVersion})

repositories {
    maven { url = "https://maven.covers1624.net/" }
}

minecraft {
    mappings channel: "official", version: minecraft_version
    runs {
        configureEach {
            workingDirectory project.file("run")
            mods {
                "${modId}" {
                    source sourceSets.main
                }
            }
        }
        client {}
        clientAuth {
            configure("client")
            mainClass = "net.covers1624.devlogin.DevLogin"
            programArguments "--launch_target", "net.minecraftforge.bootstrap.ForgeBootstrap"
        }
        server { args "--nogui" }
    }
}

dependencies {
    minecraft "net.minecraftforge:forge:\${minecraft_version}-\${forge_version}"
    runtimeOnly "net.covers1624:DevLogin:0.1.0.5"
}

tasks.named("processResources", ProcessResources).configure {
    inputs.property "version", project.version
    filesMatching("META-INF/mods.toml") {
        expand "version": project.version
    }
}
`,
    "gradle.properties": `org.gradle.jvmargs=-Xmx2G
org.gradle.daemon=false

minecraft_version=${project.minecraftVersion}
forge_version=${config.forgeVersion}
mod_id=${modId}
`,
    "src/main/resources/META-INF/mods.toml": `modLoader="javafml"
loaderVersion="[${forgeMajor},)"
license="All Rights Reserved"

[[mods]]
modId="${modId}"
version="\${version}"
displayName=${tomlString(project.name)}
description=${tomlString(description)}

[[dependencies.${modId}]]
modId="forge"
mandatory=true
versionRange="[${forgeMajor},)"
ordering="NONE"
side="BOTH"

[[dependencies.${modId}]]
modId="minecraft"
mandatory=true
versionRange="[${project.minecraftVersion},${project.minecraftVersion.split(".").slice(0, 2).join(".")}.2)"
ordering="NONE"
side="BOTH"
`,
    [`src/main/java/${packagePath}/${className}.java`]: `package ${packageName};

import net.minecraftforge.fml.common.Mod;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Mod("${modId}")
public final class ${className} {
    private static final Logger LOGGER = LoggerFactory.getLogger(${javaStringLiteral(modId)});

    public ${className}() {
        LOGGER.info(${javaStringLiteral(`Loaded ${project.name} for Minecraft ${project.minecraftVersion}.`)});
    }
}
`,
  };
  return files;
}

function createNeoForgeProjectFiles(project, version) {
  const neoForgeVersion = version.fabric.neoForgeVersion;
  const modId = project.namespace;
  const packageName = javaPackageName(modId);
  const className = modClassName(project.name);
  const packagePath = packageName.split(".").join("/");
  const description = project.description || project.name;
  return {
    "settings.gradle": `pluginManagement {
    repositories {
        gradlePluginPortal()
    }
}
`,
    "build.gradle": `plugins {
    id "java-library"
    id "maven-publish"
    id "net.neoforged.moddev" version "2.0.78"
}

version = "1.0.0"
group = "${packageName}"
base {
    archivesName = "${modId}"
}

java.toolchain.languageVersion = JavaLanguageVersion.of(21)

neoForge {
    version = "${neoForgeVersion}"
    runs {
        client {
            client()
        }
        clientAuth {
            client()
            devLogin = true
        }
        server { server(); programArgument "--nogui" }
    }
    mods {
        "${modId}" {
            sourceSet sourceSets.main
        }
    }
}
`,
    "gradle.properties": `org.gradle.jvmargs=-Xmx2G
org.gradle.parallel=true

minecraft_version=${project.minecraftVersion}
neo_version=${neoForgeVersion}
mod_id=${modId}
`,
    "src/main/resources/META-INF/neoforge.mods.toml": `modLoader="javafml"
loaderVersion="[1,)"
license="All Rights Reserved"

[[mods]]
modId="${modId}"
version="1.0.0"
displayName=${tomlString(project.name)}
description=${tomlString(description)}

[[dependencies.${modId}]]
modId="neoforge"
type="required"
versionRange="[${neoForgeVersion},)"
ordering="NONE"
side="BOTH"

[[dependencies.${modId}]]
modId="minecraft"
type="required"
versionRange="[${project.minecraftVersion}]"
ordering="NONE"
side="BOTH"
`,
    [`src/main/java/${packagePath}/${className}.java`]: `package ${packageName};

import net.neoforged.fml.common.Mod;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Mod("${modId}")
public final class ${className} {
    private static final Logger LOGGER = LoggerFactory.getLogger(${javaStringLiteral(modId)});

    public ${className}() {
        LOGGER.info(${javaStringLiteral(`Loaded ${project.name} for Minecraft ${project.minecraftVersion}.`)});
    }
}
`,
  };
}

function createMinecraftProjectFiles(options) {
  const project = validateMinecraftProject(options);
  const version = MINECRAFT_VERSIONS[project.minecraftVersion];
  if (project.type === "mod") {
    const files =
      project.modLoader === "fabric"
        ? createModProjectFiles(project, version)
        : project.modLoader === "forge"
          ? createForgeProjectFiles(project, version)
          : createNeoForgeProjectFiles(project, version);
    files["README.md"] = `# ${project.name}

${project.description || project.name}

- Minecraft: ${project.minecraftVersion}
- Loader: ${project.modLoader}
- Mod ID: \`${project.namespace}\`
- Java: ${version.javaVersion}

## Build

Install a 64-bit JDK ${version.javaVersion} and Gradle 8.14.3. Run \`gradle build\` from this folder. The distributable mod JAR will be created in \`build/libs\`. ForgeGradle currently does not support Gradle 9.

Run a development client with \`gradle runClient\`. The first run downloads Minecraft and mod-loader dependencies and may take several minutes.
Run \`gradle runClientAuth\` to launch with your Microsoft account for testing account skins. On first launch, follow the device-code prompt in the Gradle output and sign in at the displayed Microsoft URL. DevLogin stores refresh/access tokens unencrypted in \`~/.devlogin\` (outside this project); delete that folder to remove its local saved login. Do not use this on a shared or untrusted computer.

Gradle and Java must be installed separately; this starter does not bundle a Gradle wrapper. Use the loader's official documentation when changing loader versions or adding mod features.
`;
    return {
      directoryName: slugify(project.name),
      files,
      minecraftVersion: project.minecraftVersion,
      namespace: project.namespace,
      modLoader: project.modLoader,
      type: project.type,
      destination: project.destination,
    };
  }

  const format =
    project.type === "resource-pack"
      ? version.resourcePackFormat
      : version.dataPackFormat;
  const description = project.description || project.name;
  const metadata = {
    pack: {
      pack_format: format,
      description,
    },
  };
  const files = {
    "pack.mcmeta": `${JSON.stringify(metadata, null, 2)}\n`,
    "README.md": `# ${project.name}\n\n${description}\n\nTarget Minecraft version: ${project.minecraftVersion}\nPack format: ${format}\n`,
  };

  if (project.type === "resource-pack") {
    files[`assets/${project.namespace}/lang/en_us.json`] = "{}\n";
  } else {
    files[
      `data/${project.namespace}/${version.dataFunctionDirectory}/hello.mcfunction`
    ] = `say Hello from ${project.name}!\n`;
  }

  return {
    directoryName: slugify(project.name),
    files,
    minecraftVersion: project.minecraftVersion,
    namespace: project.namespace,
    type: project.type,
    destination: project.destination,
  };
}

module.exports = {
  MINECRAFT_VERSIONS,
  MOD_LOADERS,
  createMinecraftProjectFiles,
  listMinecraftVersions: () =>
    Object.entries(MINECRAFT_VERSIONS).map(([version, formats]) => ({
      version,
      ...formats,
    })),
  slugify,
  validateMinecraftProject,
};
