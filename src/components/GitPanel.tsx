import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/ipc";
import "../styles.css";

type GitFile = {
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
};

type GitStatus = {
  root: string;
  branch: string;
  branches: string[];
  remotes: string[];
  dirty: boolean;
  files: GitFile[];
  stagedCount: number;
};

type Props = {
  open: boolean;
  rootPath: string;
  onClose: () => void;
  onStatusChanged: (status: GitStatus) => void;
};

function isGitStatus(value: unknown): value is GitStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Record<string, unknown>;
  return (
    typeof status.root === "string" &&
    typeof status.branch === "string" &&
    Array.isArray(status.branches) &&
    status.branches.every((branch) => typeof branch === "string") &&
    Array.isArray(status.remotes) &&
    status.remotes.every((remote) => typeof remote === "string") &&
    typeof status.dirty === "boolean" &&
    typeof status.stagedCount === "number" &&
    Array.isArray(status.files) &&
    status.files.every(
      (file) =>
        file &&
        typeof file.path === "string" &&
        typeof file.status === "string" &&
        typeof file.staged === "boolean" &&
        typeof file.unstaged === "boolean",
    )
  );
}

export default function GitPanel({
  open,
  rootPath,
  onClose,
  onStatusChanged,
}: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [message, setMessage] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [branchTarget, setBranchTarget] = useState("");
  const [remoteTarget, setRemoteTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const acceptStatus = useCallback(
    (result: unknown) => {
      if (
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
      ) {
        throw new Error(result.error);
      }
      if (!isGitStatus(result)) {
        throw new Error("Git returned an invalid status response.");
      }
      setStatus(result);
      setBranchTarget((current) =>
        result.branches.includes(current) ? current : result.branch,
      );
      setRemoteTarget((current) =>
        result.remotes.includes(current) ? current : (result.remotes[0] ?? ""),
      );
      onStatusChanged(result);
    },
    [onStatusChanged],
  );

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      acceptStatus(await api.git.status(rootPath));
    } catch (refreshError) {
      setError(String(refreshError));
    } finally {
      setBusy(false);
    }
  }, [acceptStatus, rootPath]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const changeStage = async (file: GitFile) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = file.staged
        ? await api.git.unstage(rootPath, [file.path])
        : await api.git.stage(rootPath, [file.path]);
      acceptStatus(result);
    } catch (stageError) {
      setError(String(stageError));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.git.commit(rootPath, message);
      acceptStatus(result);
      setMessage("");
      setNotice("Commit created.");
    } catch (commitError) {
      setError(String(commitError));
    } finally {
      setBusy(false);
    }
  };

  const runWorkflow = async (
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      acceptStatus(await action());
      setNotice(successMessage);
    } catch (workflowError) {
      setError(String(workflowError));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <section
        className="command-palette git-panel"
        onClick={(event) => event.stopPropagation()}
        aria-labelledby="git-panel-title"
      >
        <header className="addon-manager-header">
          <div>
            <h2 id="git-panel-title">Source Control</h2>
            <p>{status ? `Branch: ${status.branch}` : rootPath}</p>
          </div>
          <button
            className="addon-manager-close"
            onClick={onClose}
            aria-label="Close source control"
          >
            ×
          </button>
        </header>
        <div className="addon-manager-toolbar">
          <button onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
          <span className="git-panel-counts">
            {status?.files.length ?? 0} changed · {status?.stagedCount ?? 0}{" "}
            staged
          </span>
        </div>
        <section
          className="git-workflow-controls"
          aria-label="Branch and remote workflows"
        >
          <div className="git-workflow-row">
            <label>
              Branch
              <select
                value={branchTarget}
                onChange={(event) => setBranchTarget(event.target.value)}
                disabled={busy || !status?.branches.length}
              >
                {status?.branches.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                void runWorkflow(
                  () => api.git.switchBranch(rootPath, branchTarget),
                  `Switched to ${branchTarget}.`,
                )
              }
              disabled={
                busy ||
                !branchTarget ||
                branchTarget === status?.branch ||
                status?.dirty
              }
              title={
                status?.dirty
                  ? "Commit or stash changes before switching branches"
                  : "Switch to selected branch"
              }
            >
              Switch
            </button>
          </div>
          <form
            className="git-workflow-row"
            onSubmit={(event) => {
              event.preventDefault();
              void runWorkflow(async () => {
                const result = await api.git.createBranch(rootPath, newBranch);
                setNewBranch("");
                return result;
              }, "Branch created and checked out.");
            }}
          >
            <label>
              New branch
              <input
                value={newBranch}
                onChange={(event) => setNewBranch(event.target.value)}
                placeholder="feature/my-change"
              />
            </label>
            <button type="submit" disabled={busy || !newBranch.trim()}>
              Create
            </button>
          </form>
          <div className="git-workflow-row">
            <label>
              Remote
              <select
                value={remoteTarget}
                onChange={(event) => setRemoteTarget(event.target.value)}
                disabled={busy || !status?.remotes.length}
              >
                {status?.remotes.map((remote) => (
                  <option key={remote} value={remote}>
                    {remote}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                void runWorkflow(
                  () => api.git.fetch(rootPath, remoteTarget),
                  `Fetched ${remoteTarget}.`,
                )
              }
              disabled={busy || !remoteTarget}
            >
              Fetch
            </button>
            <button
              onClick={() =>
                void runWorkflow(
                  () => api.git.pull(rootPath, remoteTarget),
                  `Pulled ${remoteTarget} with fast-forward only.`,
                )
              }
              disabled={busy || !remoteTarget || status?.dirty}
              title={
                status?.dirty
                  ? "Commit or stash changes before pulling"
                  : "Pull current branch with fast-forward only"
              }
            >
              Pull
            </button>
            <button
              onClick={() =>
                void runWorkflow(
                  () => api.git.push(rootPath, remoteTarget),
                  `Pushed ${status?.branch} to ${remoteTarget}.`,
                )
              }
              disabled={busy || !remoteTarget || !status?.branch}
            >
              Push
            </button>
          </div>
          {status && status.remotes.length === 0 && (
            <p className="addon-manager-empty">
              No remotes configured. Add one with `git remote add` in Terminal.
            </p>
          )}
        </section>
        {error && <p className="addon-manager-message error">{error}</p>}
        {notice && <p className="addon-manager-message">{notice}</p>}
        <div className="git-file-list">
          {status?.files.map((file) => (
            <div className="git-file-row" key={file.path}>
              <span className="git-file-status" title={file.status}>
                {file.status}
              </span>
              <code title={file.path}>{file.path}</code>
              <button
                onClick={() => void changeStage(file)}
                disabled={busy}
                title={file.staged ? "Unstage file" : "Stage file"}
              >
                {file.staged ? "Unstage" : "Stage"}
              </button>
            </div>
          ))}
          {status && status.files.length === 0 && (
            <p className="addon-manager-empty">Working tree is clean.</p>
          )}
          {!status && !error && (
            <p className="addon-manager-empty">
              {busy
                ? "Loading Git status..."
                : "No repository status available."}
            </p>
          )}
        </div>
        <form
          className="git-commit-form"
          onSubmit={(event) => {
            event.preventDefault();
            void commit();
          }}
        >
          <label htmlFor="git-commit-message">Commit message</label>
          <textarea
            id="git-commit-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Describe the staged changes"
            rows={3}
          />
          <button
            className="primary"
            type="submit"
            disabled={busy || !message.trim() || !status?.stagedCount}
          >
            Commit Staged Changes
          </button>
        </form>
      </section>
    </div>
  );
}
