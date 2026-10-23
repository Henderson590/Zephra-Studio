import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/ipc";
import { FileTab, WorkspaceSnapshot } from "../types";
import "../styles.css";

type Props = {
  open: boolean;
  rootPath: string;
  tabs: FileTab[];
  activeTabId: string | null;
  onClose: () => void;
  onRestore: (snapshot: WorkspaceSnapshot) => Promise<void>;
};

export default function WorkspaceSnapshots({
  open,
  rootPath,
  tabs,
  activeTabId,
  onClose,
  onRestore,
}: Props) {
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([]);
  const [projectSnapshots, setProjectSnapshots] = useState<
    Array<{
      id: string;
      label: string;
      createdAt: string;
      fileCount: number;
      totalBytes: number;
      skippedSymlinks: number;
    }>
  >([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result: unknown = await api.snapshots.list(rootPath);
      if (
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
      ) {
        throw new Error(result.error);
      }
      if (!Array.isArray(result)) {
        throw new Error("Snapshot list response was invalid.");
      }
      setSnapshots(result as WorkspaceSnapshot[]);
      const projectResult: unknown = await api.projectSnapshots.list(rootPath);
      if (
        projectResult &&
        typeof projectResult === "object" &&
        "error" in projectResult &&
        typeof projectResult.error === "string"
      ) {
        throw new Error(projectResult.error);
      }
      if (!Array.isArray(projectResult)) {
        throw new Error("Full-project snapshot list response was invalid.");
      }
      setProjectSnapshots(projectResult);
    } catch (refreshError) {
      setError(String(refreshError));
    } finally {
      setBusy(false);
    }
  }, [rootPath]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const create = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.snapshots.create(rootPath, {
        tabs: tabs.map((tab) => ({
          id: tab.id,
          filePath: tab.filePath,
          language: tab.language,
          content: tab.content,
          isDirty: tab.isDirty,
        })),
        activeTabId,
        label,
      });
      if (!result || "error" in result) {
        throw new Error(result?.error || "Could not create snapshot.");
      }
      setLabel("");
      setNotice("Snapshot saved. Project files were not changed.");
      await refresh();
    } catch (createError) {
      setError(String(createError));
    } finally {
      setBusy(false);
    }
  };

  const createProjectSnapshot = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.projectSnapshots.create(rootPath, label);
      if (!result || "error" in result) {
        throw new Error(result?.error || "Could not create project snapshot.");
      }
      setLabel("");
      setNotice(
        `Full-project snapshot saved: ${result.fileCount} files (${Math.ceil(result.totalBytes / 1024)} KB).`,
      );
      await refresh();
    } catch (snapshotError) {
      setError(String(snapshotError));
    } finally {
      setBusy(false);
    }
  };

  const restoreProjectSnapshot = async (
    snapshot: (typeof projectSnapshots)[number],
  ) => {
    const folderName = window.prompt(
      "Name a new folder for the restored project:",
      `${snapshot.label || "project"}-restored`,
    );
    if (!folderName) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const parentPath = await api.project.chooseDirectory();
      if (!parentPath) return;
      const result = await api.projectSnapshots.restore(
        rootPath,
        snapshot.id,
        parentPath,
        folderName,
      );
      if (!result || "error" in result) {
        throw new Error(result?.error || "Could not restore project snapshot.");
      }
      setNotice(`Project restored to ${result.path}`);
    } catch (restoreError) {
      setError(String(restoreError));
    } finally {
      setBusy(false);
    }
  };

  const removeProjectSnapshot = async (
    snapshot: (typeof projectSnapshots)[number],
  ) => {
    if (
      !window.confirm(
        `Delete the full-project snapshot "${snapshot.label || "Untitled snapshot"}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.projectSnapshots.remove(rootPath, snapshot.id);
      if (result?.error) throw new Error(result.error);
      await refresh();
    } catch (removeError) {
      setError(String(removeError));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (snapshot: WorkspaceSnapshot) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.snapshots.remove(rootPath, snapshot.id);
      if (result?.error) throw new Error(result.error);
      await refresh();
    } catch (removeError) {
      setError(String(removeError));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (snapshot: WorkspaceSnapshot) => {
    if (
      !window.confirm(
        `Restore ${snapshot.tabs.length} editor tab${snapshot.tabs.length === 1 ? "" : "s"} from this snapshot? The current open tabs will be replaced, but no project files will be written.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onRestore(snapshot);
      onClose();
    } catch (restoreError) {
      setError(String(restoreError));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <section
        className="command-palette snapshots-panel"
        onClick={(event) => event.stopPropagation()}
        aria-labelledby="snapshots-title"
      >
        <header className="addon-manager-header">
          <div>
            <h2 id="snapshots-title">Editor Snapshots</h2>
            <p>
              Create a tab checkpoint or a bounded full-project source backup.
            </p>
          </div>
          <button
            className="addon-manager-close"
            onClick={onClose}
            aria-label="Close snapshots"
          >
            ×
          </button>
        </header>
        <div className="snapshot-create">
          <label htmlFor="snapshot-label">Snapshot name (optional)</label>
          <div>
            <input
              id="snapshot-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={120}
              placeholder="Before refactoring..."
            />
            <button onClick={() => void create()} disabled={busy}>
              Snapshot {tabs.length} Open Tabs
            </button>
            <button
              onClick={() => void createProjectSnapshot()}
              disabled={busy}
            >
              Snapshot Project
            </button>
          </div>
          <small>
            Tab snapshots: 5 per workspace, 20 MB each. Project snapshots: 5 per
            workspace and 50 MB uncompressed each. Project archives skip
            dependency/build folders and symbolic links.
          </small>
        </div>
        {error && <p className="addon-manager-message error">{error}</p>}
        {notice && <p className="addon-manager-message">{notice}</p>}
        <div className="snapshot-list">
          {snapshots.map((snapshot) => (
            <article className="snapshot-card" key={snapshot.id}>
              <div className="snapshot-card-info">
                <strong>{snapshot.label || "Untitled snapshot"}</strong>
                <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
                <span>
                  {snapshot.tabs.length} tab
                  {snapshot.tabs.length === 1 ? "" : "s"}
                  {snapshot.tabs.some((tab) => tab.isDirty)
                    ? " · includes unsaved changes"
                    : ""}
                </span>
              </div>
              <div className="snapshot-card-actions">
                <button onClick={() => void restore(snapshot)} disabled={busy}>
                  Restore
                </button>
                <button onClick={() => void remove(snapshot)} disabled={busy}>
                  Delete
                </button>
              </div>
            </article>
          ))}
          {!busy && snapshots.length === 0 && (
            <p className="addon-manager-empty">No editor snapshots yet.</p>
          )}
          <h3>Full-project backups</h3>
          {projectSnapshots.map((snapshot) => (
            <article className="snapshot-card" key={snapshot.id}>
              <div className="snapshot-card-info">
                <strong>{snapshot.label || "Untitled project snapshot"}</strong>
                <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
                <span>
                  {snapshot.fileCount} files ·{" "}
                  {Math.ceil(snapshot.totalBytes / 1024)} KB
                  {snapshot.skippedSymlinks
                    ? ` · skipped ${snapshot.skippedSymlinks} symbolic links`
                    : ""}
                </span>
              </div>
              <div className="snapshot-card-actions">
                <button
                  onClick={() => void restoreProjectSnapshot(snapshot)}
                  disabled={busy}
                >
                  Restore to New Folder
                </button>
                <button
                  onClick={() => void removeProjectSnapshot(snapshot)}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
          {!busy && projectSnapshots.length === 0 && (
            <p className="addon-manager-empty">
              No full-project snapshots yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
