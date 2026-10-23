import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/ipc";
import { LanguageTool } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSettingsChanged: () => void;
};

function isLanguageTool(value: unknown): value is LanguageTool {
  if (!value || typeof value !== "object") return false;
  const tool = value as Record<string, unknown>;
  return (
    typeof tool.id === "string" &&
    typeof tool.language === "string" &&
    typeof tool.role === "string" &&
    typeof tool.command === "string" &&
    typeof tool.hint === "string" &&
    typeof tool.configuredPath === "string" &&
    (typeof tool.resolvedPath === "string" || tool.resolvedPath === null) &&
    typeof tool.available === "boolean"
  );
}

export default function LanguageTools({
  open,
  onClose,
  onSettingsChanged,
}: Props) {
  const [tools, setTools] = useState<LanguageTool[]>([]);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const detect = useCallback(
    async (configuredPaths: Record<string, string>) => {
      const result: unknown = await api.languageTools.detect(configuredPaths);
      if (!Array.isArray(result) || !result.every(isLanguageTool)) {
        throw new Error("The tool discovery response was invalid.");
      }
      setTools(result);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await detect(paths);
      setStatus(
        "Tool availability checked. Configured language servers start automatically when a supported source file is opened.",
      );
    } catch (refreshError) {
      setError(String(refreshError));
    } finally {
      setBusy(false);
    }
  }, [detect, paths]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    setStatus(null);
    void (async () => {
      try {
        const savedPaths: unknown = await api.settings.get("languageTools");
        const nextPaths =
          savedPaths &&
          typeof savedPaths === "object" &&
          !Array.isArray(savedPaths)
            ? Object.fromEntries(
                Object.entries(savedPaths).filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === "string",
                ),
              )
            : {};
        if (cancelled) return;
        setPaths(nextPaths);
        await detect(nextPaths);
      } catch (loadError) {
        if (!cancelled) setError(String(loadError));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detect, open]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await api.settings.set("languageTools", paths);
      if (result?.error) throw new Error(result.error);
      await detect(paths);
      onSettingsChanged();
      setStatus("Executable path overrides saved.");
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <section
        className="command-palette addon-manager language-tools"
        onClick={(event) => event.stopPropagation()}
        aria-labelledby="language-tools-title"
      >
        <header className="addon-manager-header">
          <div>
            <h2 id="language-tools-title">Language Tools</h2>
            <p>
              Discover installed runtimes and language servers, or set an
              executable path override.
            </p>
          </div>
          <button
            className="addon-manager-close"
            onClick={onClose}
            aria-label="Close language tools"
          >
            ×
          </button>
        </header>
        <p className="language-tools-notice">
          Matching configured language servers are started over stdio while
          supported source files are open. Their processes run with your user
          permissions; only configure tools you trust.
        </p>
        <div className="addon-manager-toolbar">
          <button onClick={() => void refresh()} disabled={busy}>
            Rescan
          </button>
          <button onClick={() => void save()} disabled={busy}>
            Save Paths
          </button>
          {busy && <span className="addon-manager-empty">Checking...</span>}
        </div>
        {error && <p className="addon-manager-message error">{error}</p>}
        {status && <p className="addon-manager-message">{status}</p>}
        <div className="addon-manager-list">
          {tools.map((tool) => (
            <div className="language-tool-row" key={tool.id}>
              <div className="addon-card-info">
                <strong>
                  {tool.language} · {tool.role}
                </strong>
                <span>
                  {tool.available
                    ? `Available: ${tool.resolvedPath}`
                    : `Not found (${tool.command})`}
                </span>
                {!tool.available && (
                  <span className="language-tool-hint">{tool.hint}</span>
                )}
                <label>
                  Executable path override
                  <input
                    value={paths[tool.id] ?? ""}
                    placeholder={`Search PATH: ${tool.command}`}
                    onChange={(event) =>
                      setPaths((previous) => ({
                        ...previous,
                        [tool.id]: event.target.value,
                      }))
                    }
                    aria-label={`${tool.language} ${tool.role} executable path`}
                  />
                </label>
              </div>
              <span
                className={`language-tool-status ${tool.available ? "available" : ""}`}
              >
                {tool.available ? "Available" : "Missing"}
              </span>
            </div>
          ))}
          {!busy && tools.length === 0 && (
            <p className="addon-manager-empty">
              No language tool results are available.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
