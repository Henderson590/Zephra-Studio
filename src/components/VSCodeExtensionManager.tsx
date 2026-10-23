import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/ipc";
import "../styles.css";

type VsixInfo = {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  themes: Array<{ label: string; uiTheme?: string; path: string }>;
  snippets: Array<{ language: string; path: string }>;
  error?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onApplyTheme: (name: string, theme: Record<string, any>) => void;
  onInstallSnippets: (
    extension: VsixInfo,
    files: Record<string, string>,
  ) => void;
};

export default function VSCodeExtensionManager({
  open,
  onClose,
  onApplyTheme,
  onInstallSnippets,
}: Props) {
  const [extensions, setExtensions] = useState<VsixInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const result: unknown = await api.extensions.vsix.list();
    if (
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
    ) {
      throw new Error(result.error);
    }
    if (!Array.isArray(result)) {
      throw new Error("VSIX extension list response was invalid.");
    }
    setExtensions(result as VsixInfo[]);
  }, []);

  useEffect(() => {
    if (!open) return;
    setNotice(null);
    void refresh().catch((refreshError: unknown) =>
      setError(String(refreshError)),
    );
  }, [open, refresh]);

  const install = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.extensions.vsix.install();
      if (result === null) return;
      if ("error" in result) throw new Error(result.error);
      setNotice(
        `${result.name} installed. Only its theme and snippet contributions are supported; extension code is not executed.`,
      );
      await refresh();
    } catch (installError) {
      setError(String(installError));
    } finally {
      setBusy(false);
    }
  };

  const loadContributions = async (extension: VsixInfo) => {
    const result = await api.extensions.vsix.load(
      extension.id,
      extension.version,
    );
    if (!result || "error" in result) {
      throw new Error(result?.error || "Could not load VSIX contributions.");
    }
    return result;
  };

  const loadSnippets = async (extension: VsixInfo) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await loadContributions(extension);
      onInstallSnippets(extension, result.contentFiles ?? {});
      setNotice(`${extension.name} snippets loaded for this session.`);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setBusy(false);
    }
  };

  const activateTheme = async (
    extension: VsixInfo,
    theme: VsixInfo["themes"][number],
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await loadContributions(extension);
      const raw = result.contentFiles?.[theme.path];
      if (!raw) throw new Error(`Theme '${theme.label}' was not found.`);
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`Theme '${theme.label}' has an invalid shape.`);
      }
      onApplyTheme(
        `${extension.id}-${theme.label}`,
        parsed as Record<string, any>,
      );
      setNotice(`${theme.label} activated for this session.`);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (extension: VsixInfo) => {
    if (!window.confirm(`Remove ${extension.name} ${extension.version}?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.extensions.vsix.remove(
        extension.id,
        extension.version,
      );
      if (result?.error) throw new Error(result.error);
      await refresh();
    } catch (removeError) {
      setError(String(removeError));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <section
        className="command-palette addon-manager"
        onClick={(event) => event.stopPropagation()}
        aria-labelledby="vsix-manager-title"
      >
        <header className="addon-manager-header">
          <div>
            <h2 id="vsix-manager-title">VS Code-Compatible Contributions</h2>
            <p>
              Install local .vsix files. Themes and snippets are supported;
              extension activation code and arbitrary VS Code APIs are not.
            </p>
          </div>
          <button
            className="addon-manager-close"
            onClick={onClose}
            aria-label="Close VS Code extension manager"
          >
            ×
          </button>
        </header>
        <div className="addon-manager-toolbar">
          <button
            className="primary"
            onClick={() => void install()}
            disabled={busy}
          >
            Install .vsix
          </button>
          <button onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
        </div>
        {error && <p className="addon-manager-message error">{error}</p>}
        {notice && <p className="addon-manager-message">{notice}</p>}
        <div className="addon-manager-list">
          {extensions.map((extension) => (
            <article
              className="addon-card"
              key={`${extension.id}-${extension.version}`}
            >
              <div className="addon-card-info">
                <strong>{extension.name}</strong>
                <span>
                  {extension.id} · {extension.version}
                </span>
                {extension.error ? (
                  <span className="language-tool-status">
                    {extension.error}
                  </span>
                ) : (
                  <span>
                    {extension.themes.length} theme
                    {extension.themes.length === 1 ? "" : "s"} ·{" "}
                    {extension.snippets.length} snippet contribution
                    {extension.snippets.length === 1 ? "" : "s"}
                  </span>
                )}
                {extension.description && <p>{extension.description}</p>}
              </div>
              {!extension.error && (
                <div className="addon-card-actions">
                  {extension.themes.map((theme) => (
                    <button
                      className="primary"
                      key={theme.path}
                      onClick={() => void activateTheme(extension, theme)}
                      disabled={busy}
                    >
                      {theme.label}
                    </button>
                  ))}
                  {extension.snippets.length > 0 && (
                    <button
                      className="primary"
                      onClick={() => void loadSnippets(extension)}
                      disabled={busy}
                    >
                      Load Snippets
                    </button>
                  )}
                  <button
                    className="toolbar-button"
                    onClick={() => void remove(extension)}
                    disabled={busy}
                  >
                    Remove
                  </button>
                </div>
              )}
            </article>
          ))}
          {!extensions.length && (
            <p className="addon-manager-empty">No VSIX files installed.</p>
          )}
        </div>
      </section>
    </div>
  );
}
