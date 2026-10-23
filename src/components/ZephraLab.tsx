import React, { useEffect, useState } from "react";
import "../styles.css";
import { api } from "../api/ipc";

function joinPath(parent: string, child: string) {
  const separator = parent.includes("\\") ? "\\" : "/";
  const normalizedParent = parent.replace(/[\\/]+$/, "");
  return normalizedParent ? `${normalizedParent}${separator}${child}` : `${separator}${child}`;
}

const defaultConfig = `file_extensions = [".zph"]
plugins = []
builtins = []

[project]
language_version = "0.2.0"

[feature_flags]
async = false
imports = true
`;

type Props = {
  open: boolean;
  rootPath: string | null;
  onClose: () => void;
};

export default function ZephraLab({ open, rootPath, onClose }: Props) {
  const [pythonPath, setPythonPath] = useState("python");
  const [autoSave, setAutoSave] = useState(true);
  const [configText, setConfigText] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatusMessage(null);
    api.settings.get("pythonPath").then((value: any) => {
      if (typeof value === "string") setPythonPath(value);
    });
    api.settings.get("autoSave").then((value: any) => {
      if (typeof value === "boolean") setAutoSave(value);
    });

    if (rootPath) {
      const configPath = joinPath(rootPath, "zephra.toml");
      api.fs.readFile(configPath).then((res: any) => {
        if (res?.data !== undefined) {
          setConfigText(res.data);
        } else if (res?.error?.includes("ENOENT")) {
          setConfigText(defaultConfig);
        } else {
          setStatusMessage(res?.error || "Unable to read zephra.toml.");
        }
      }).catch((error: unknown) => setStatusMessage(String(error)));
    }
  }, [open, rootPath]);

  const saveSettings = async () => {
    try {
      await api.settings.set("pythonPath", pythonPath);
      await api.settings.set("autoSave", autoSave);
      setStatusMessage("Settings saved.");
      setTimeout(() => setStatusMessage(null), 2400);
    } catch (error) {
      setStatusMessage(String(error));
    }
  };

  const saveConfig = async () => {
    if (!rootPath || configText === null) return;
    const configPath = joinPath(rootPath, "zephra.toml");
    const result = await api.fs.writeFile(configPath, configText);
    if (result?.error) {
      setStatusMessage(`Could not save zephra.toml: ${result.error}`);
      return;
    }
    setStatusMessage("zephra.toml saved. It will be read the next time you run a Zephra file.");
    setTimeout(() => setStatusMessage(null), 2400);
  };

  const reloadRuntime = () => {
    setStatusMessage("Zephra settings are read when the next file starts.");
    setTimeout(() => setStatusMessage(null), 2400);
  };

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()} style={{ width: "700px" }}>
        <div className="command-palette-input" style={{ display: "flex", gap: "12px", padding: "16px" }}>
          <h2 style={{ margin: 0 }}>Zephra Lab</h2>
          <button style={{ marginLeft: "auto" }} onClick={onClose}>
            Close
          </button>
        </div>
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label>
                Python Path
                <input
                  type="text"
                  value={pythonPath}
                  onChange={(e) => setPythonPath(e.target.value)}
                  style={{ width: "100%", marginTop: "4px" }}
                />
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  style={{ marginRight: "6px" }}
                />
                Enable auto-save
              </label>
            </div>
          </div>

          <div style={{ marginTop: "16px" }}>
            <div style={{ fontWeight: 600, marginBottom: "6px" }}>Zephra config</div>
            <textarea
              value={configText ?? ""}
              onChange={(e) => setConfigText(e.target.value)}
              spellCheck={false}
              style={{ width: "100%", height: "160px", fontFamily: "ui-monospace", fontSize: "13px" }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px" }}>
            <div>
              <button onClick={saveSettings} className="primary">
                Save Settings
              </button>
              <button onClick={saveConfig} style={{ marginLeft: "10px" }} className="primary">
                Save Zephra Config
              </button>
            </div>
            <button onClick={reloadRuntime} className="primary">
              Reload Runtime
            </button>
          </div>

          {statusMessage && <div style={{ marginTop: "12px", color: "var(--accent)" }}>{statusMessage}</div>}

          <div style={{ marginTop: "16px", lineHeight: "1.4", color: "var(--muted)" }}>
            <p>
              This panel provides tools for Zephra development. You can edit your workspace&apos;s <code>zephra.toml</code> and
              change runtime settings.
            </p>
            <p>
              Note: changes to the runtime itself may require restarting the application.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
