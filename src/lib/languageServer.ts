const LANGUAGE_SERVER_TOOLS: Record<
  string,
  { toolId: string; args: string[] }
> = {
  typescript: {
    toolId: "typescript-language-server",
    args: ["--stdio"],
  },
  javascript: {
    toolId: "typescript-language-server",
    args: ["--stdio"],
  },
  python: { toolId: "pyright", args: ["--stdio"] },
  java: { toolId: "jdtls", args: [] },
  csharp: { toolId: "csharp-language-server", args: [] },
  html: { toolId: "html-language-server", args: ["--stdio"] },
  css: { toolId: "css-language-server", args: ["--stdio"] },
  json: { toolId: "json-language-server", args: ["--stdio"] },
  kotlin: { toolId: "kotlin", args: [] },
  cpp: { toolId: "clangd", args: ["--background-index"] },
  rust: { toolId: "rust-analyzer", args: [] },
  go: { toolId: "gopls", args: ["serve"] },
};

export function languageServerTool(languageId: string) {
  return LANGUAGE_SERVER_TOOLS[languageId] ?? null;
}

export function filePathToUri(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (/^[a-zA-Z]:$/.test(parts[0])) {
    return `file:///${parts[0]}/${parts
      .slice(1)
      .map((part) => encodeURIComponent(part))
      .join("/")}`;
  }
  return `file:///${parts
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}
