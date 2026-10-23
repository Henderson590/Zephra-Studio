const fs = require("fs");
const path = require("path");

const LANGUAGE_TOOLS = [
  {
    id: "gradle",
    language: "Minecraft / Java",
    role: "Build tool",
    command: "gradle",
    hint: "Install Gradle 8.14.3 and add its bin folder to PATH to build generated Minecraft mod projects.",
  },
  {
    id: "java",
    language: "Java",
    role: "JDK",
    command: "javac",
    hint: "Install a JDK and add its bin folder to PATH.",
  },
  {
    id: "jdtls",
    language: "Java",
    role: "Language server",
    command: "jdtls",
    hint: "Install Eclipse JDT Language Server and configure jdtls on PATH.",
  },
  {
    id: "typescript",
    language: "TypeScript",
    role: "Runtime",
    command: "node",
    hint: "Install Node.js.",
  },
  {
    id: "typescript-language-server",
    language: "TypeScript",
    role: "Language server",
    command: "typescript-language-server",
    hint: "Install typescript-language-server and TypeScript in your development environment.",
  },
  {
    id: "python",
    language: "Python",
    role: "Interpreter",
    command: "python",
    hint: "Install Python or configure its executable path.",
  },
  {
    id: "pyright",
    language: "Python",
    role: "Language server",
    command: "pyright-langserver",
    hint: "Install Pyright and configure pyright-langserver on PATH.",
  },
  {
    id: "ruff",
    language: "Python",
    role: "Formatter/linter",
    command: "ruff",
    hint: "Install Ruff and configure its executable on PATH.",
  },
  {
    id: "html-language-server",
    language: "HTML",
    role: "Language server",
    command: "vscode-html-language-server",
    hint: "Install the HTML language server package and configure its launcher.",
  },
  {
    id: "css-language-server",
    language: "CSS",
    role: "Language server",
    command: "vscode-css-language-server",
    hint: "Install the CSS language server package and configure its launcher.",
  },
  {
    id: "json-language-server",
    language: "JSON",
    role: "Language server",
    command: "vscode-json-language-server",
    hint: "Install the JSON language server package and configure its launcher.",
  },
  {
    id: "kotlin",
    language: "Kotlin",
    role: "Language server",
    command: "kotlin-language-server",
    hint: "Install Kotlin Language Server and configure its launcher.",
  },
  {
    id: "dotnet",
    language: "C#",
    role: ".NET SDK",
    command: "dotnet",
    hint: "Install a .NET SDK.",
  },
  {
    id: "csharp-language-server",
    language: "C#",
    role: "Language server",
    command: "csharp-ls",
    hint: "Install csharp-ls and configure it on PATH.",
  },
  {
    id: "clangd",
    language: "C/C++",
    role: "Language server",
    command: "clangd",
    hint: "Install LLVM/Clang and configure clangd on PATH.",
  },
  {
    id: "rust-analyzer",
    language: "Rust",
    role: "Language server",
    command: "rust-analyzer",
    hint: "Install rust-analyzer, typically through rustup.",
  },
  {
    id: "rustc",
    language: "Rust",
    role: "Compiler",
    command: "rustc",
    hint: "Install the Rust toolchain through rustup.",
  },
  {
    id: "gopls",
    language: "Go",
    role: "Language server",
    command: "gopls",
    hint: "Install gopls using the Go toolchain.",
  },
  {
    id: "go",
    language: "Go",
    role: "Compiler/toolchain",
    command: "go",
    hint: "Install the Go toolchain.",
  },
];

function findOnPath(command, options = {}) {
  if (typeof command !== "string" || !command.trim()) return null;

  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const pathModule = options.pathModule || path;
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
  const pathValue = pathKey ? env[pathKey] : "";
  const pathExtKey = Object.keys(env).find(
    (key) => key.toLowerCase() === "pathext",
  );
  const pathExt = pathExtKey ? env[pathExtKey] : ".COM;.EXE;.BAT;.CMD";
  const extensions =
    platform === "win32" ? pathExt.split(";").filter(Boolean) : [""];
  const hasDirectory = pathModule.isAbsolute(command) || /[\\/]/.test(command);
  const directories = hasDirectory
    ? [""]
    : pathValue.split(pathModule.delimiter);
  const hasExtension = Boolean(pathModule.extname(command));

  for (const directory of directories) {
    const basePath = hasDirectory
      ? pathModule.resolve(command)
      : pathModule.join(directory, command);
    const candidates =
      hasExtension || platform !== "win32"
        ? [basePath]
        : [
            basePath,
            ...extensions.map((extension) => `${basePath}${extension}`),
          ];
    for (const candidate of candidates) {
      try {
        const stat = fs.statSync(candidate);
        if (!stat.isFile()) continue;
        if (platform !== "win32" && (stat.mode & 0o111) === 0) continue;
        if (existsSync(candidate)) return pathModule.resolve(candidate);
      } catch {
        continue;
      }
    }
  }

  return null;
}

function detectLanguageTools(
  configuredPaths = {},
  pythonPath = "python",
  options = {},
) {
  return LANGUAGE_TOOLS.map((tool) => {
    const configured =
      typeof configuredPaths[tool.id] === "string"
        ? configuredPaths[tool.id].trim()
        : "";
    const command =
      configured || (tool.id === "python" ? pythonPath : tool.command);
    const resolvedPath = findOnPath(command, options);
    return {
      ...tool,
      configuredPath: configured,
      resolvedPath,
      available: Boolean(resolvedPath),
    };
  });
}

module.exports = { LANGUAGE_TOOLS, detectLanguageTools, findOnPath };
