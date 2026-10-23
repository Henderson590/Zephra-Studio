import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/ipc";
import { StudioAddon, StudioAddonCommand } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  onCommandsLoaded: (addonName: string, commands: StudioAddonCommand[]) => void;
  onRunAddon: (addonPath: string) => void;
};

export default function AddonManager({
  open,
  onClose,
  onCommandsLoaded,
  onRunAddon,
}: Props) {
  const [addons, setAddons] = useState<StudioAddon[]>([]);
  const [loaded, setLoaded] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const result = await api.extensions.list();
      if (!Array.isArray(result)) {
        setError(result?.error || "Unable to read the add-ons folder.");
        return;
      }
      setAddons(result);
    } catch (listError) {
      setError(String(listError));
    }
  }, []);

  useEffect(() => {
    if (open) {
      setStatus(null);
      void refresh();
    }
  }, [open, refresh]);

  const installAddon = async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await api.extensions.install();
      if (result?.error) throw new Error(result.error);
      if (result?.success) {
        setStatus("Add-on installed. Load it to register its editor commands.");
        await refresh();
      }
    } catch (installError) {
      setError(String(installError));
    } finally {
      setBusy(false);
    }
  };

  const openAddonsFolder = async () => {
    try {
      const result = await api.extensions.openFolder();
      if (result?.error) setError(result.error);
    } catch (openError) {
      setError(String(openError));
    }
  };

  const loadAddon = async (addon: StudioAddon) => {
    if (
      !window.confirm(
        `Load ${addon.name} in the restricted .zph add-on runtime? Add-ons can use the editor command API, but file access, imports, and system shell access are disabled. The runtime has execution and output limits.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await api.extensions.load(addon.path);
      if (!result?.success)
        throw new Error(result?.error || "The add-on could not be loaded.");
      const commands = Array.isArray(result.commands) ? result.commands : [];
      onCommandsLoaded(addon.name, commands);
      setLoaded((current) =>
        current.includes(addon.path) ? current : [...current, addon.path],
      );
      setStatus(
        commands.length
          ? `${addon.name} loaded with ${commands.length} editor command${commands.length === 1 ? "" : "s"}.`
          : `${addon.name} ran successfully and registered no editor commands.`,
      );
      if (result.output) setStatus((current) => `${current}\n${result.output}`);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div
        className="command-palette addon-manager"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="addon-manager-header">
          <div>
            <h2>Add-ons</h2>
            <p>
              Add-ons run in a restricted Zephra runtime. File access, imports,
              and shell capabilities are disabled.
            </p>
          </div>
          <button
            className="addon-manager-close"
            onClick={onClose}
            aria-label="Close add-ons"
          >
            ×
          </button>
        </div>
        <div className="addon-manager-toolbar">
          <button className="primary" onClick={installAddon} disabled={busy}>
            Install .zph Add-on
          </button>
          <button className="toolbar-button" onClick={openAddonsFolder}>
            Open Add-ons Folder
          </button>
        </div>
        {error && <div className="addon-manager-message error">{error}</div>}
        {status && <div className="addon-manager-message">{status}</div>}
        <div className="addon-manager-list">
          {addons.map((addon) => (
            <div className="addon-card" key={addon.path}>
              <div className="addon-card-info">
                <strong>{addon.name}</strong>
                <span>{addon.installed ? "Installed" : "Example"}</span>
                <code>{addon.path}</code>
              </div>
              <div className="addon-card-actions">
                <button
                  className="toolbar-button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Run ${addon.name} in the restricted .zph add-on runtime? File access, imports, and system shell access are disabled.`,
                      )
                    ) {
                      onRunAddon(addon.path);
                    }
                  }}
                  disabled={busy}
                >
                  Run
                </button>
                <button
                  className="primary"
                  onClick={() => loadAddon(addon)}
                  disabled={busy}
                >
                  {loaded.includes(addon.path) ? "Reload" : "Load"}
                </button>
              </div>
            </div>
          ))}
          {addons.length === 0 && !error && (
            <div className="addon-manager-empty">
              No add-ons found. Install a `.zph` add-on to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
