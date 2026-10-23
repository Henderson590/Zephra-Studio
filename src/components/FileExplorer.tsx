import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/ipc";
import "../styles.css";

type Props = {
  rootPath: string;
  openFile: (filePath: string) => Promise<any>;
  onCreateFile: (filePath: string) => Promise<void>;
  onDeleteFile: (filePath: string) => Promise<void>;
  onRenameFile: (oldPath: string, newPath: string) => Promise<void>;
};

type Node = {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: Node[];
};

function joinPath(parent: string, child: string) {
  const separator = parent.includes("\\") ? "\\" : "/";
  const normalizedParent = parent.replace(/[\\/]+$/, "");
  return normalizedParent ? `${normalizedParent}${separator}${child}` : `${separator}${child}`;
}

export default function FileExplorer({ rootPath, openFile, onCreateFile, onDeleteFile, onRenameFile }: Props) {
  const [tree, setTree] = useState<Node[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activePath, setActivePath] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"none" | "create" | "rename">("none");
  const [editTarget, setEditTarget] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nodes = await api.fs.readDir(rootPath);
      if (!Array.isArray(nodes)) throw new Error(nodes?.error || "Unable to read this folder.");
      setTree(
        nodes
          .map((entry) => ({
            name: entry.name,
            path: joinPath(rootPath, entry.name),
            isDirectory: entry.isDirectory
          }))
          .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1))
      );
      setError(null);
    } catch (err) {
      setError(String(err));
    }
  }, [rootPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const walk = async (node: Node): Promise<Node> => {
    if (!node.isDirectory) return node;
    const entries = await api.fs.readDir(node.path);
    if (!Array.isArray(entries)) throw new Error(entries?.error || `Unable to read ${node.path}.`);
    const children = entries
      .map((entry) => ({
        name: entry.name,
        path: joinPath(node.path, entry.name),
        isDirectory: entry.isDirectory
      }))
      .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1));
    return { ...node, children };
  };

  const expandPath = async (node: Node) => {
    const isExpanded = Boolean(expanded[node.path]);
    try {
      if (!isExpanded && node.isDirectory) {
        const loaded = await walk(node);
        const updateNode = (nodes: Node[]): Node[] =>
          nodes.map((item) =>
            item.path === node.path ? loaded : { ...item, children: item.children ? updateNode(item.children) : undefined }
          );
        setTree((previous) => updateNode(previous));
      }
      setExpanded((previous) => ({ ...previous, [node.path]: !isExpanded }));
      setError(null);
    } catch (expandError) {
      setError(String(expandError));
    }
  };

  const onSelectFile = async (node: Node) => {
    if (node.isDirectory) {
      await expandPath(node);
      return;
    }

    setActivePath(node.path);
    try {
      await openFile(node.path);
      setError(null);
    } catch (openError) {
      setError(String(openError));
    }
  };

  const createFile = () => {
    setEditorMode("create");
    setNewName("");
  };

  const confirmCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    if (/[\\/]/.test(name) || name === "." || name === "..") {
      setError("Enter a file name without folder separators.");
      return;
    }
    const path = joinPath(rootPath, name);
    try {
      await onCreateFile(path);
      setActivePath(path);
      await refresh();
      setEditorMode("none");
      setError(null);
    } catch (createError) {
      setError(String(createError));
    }
  };

  const cancelEdit = () => {
    setEditorMode("none");
  };

  const startRename = (path: string) => {
    setEditorMode("rename");
    setEditTarget(path);
    setNewName(path.split(/\\|\//).pop() ?? "");
  };

  const confirmRename = async () => {
    const newBase = newName.trim();
    if (!newBase) return;
    if (/[\\/]/.test(newBase) || newBase === "." || newBase === "..") {
      setError("Enter a file name without folder separators.");
      return;
    }
    const oldPath = editTarget;
    const newPath = oldPath.replace(/[^\\/]+$/, newBase);
    try {
      await onRenameFile(oldPath, newPath);
      setActivePath((current) => (current === oldPath ? newPath : current));
      setEditorMode("none");
      await refresh();
      setError(null);
    } catch (renameError) {
      setError(String(renameError));
    }
  };

  const confirmDelete = async (path: string) => {
    const name = path.split(/\\|\//).pop() ?? path;
    if (!window.confirm(`Delete ${name}?`)) return;
    try {
      await onDeleteFile(path);
      await refresh();
      if (activePath === path || activePath?.startsWith(`${path}/`) || activePath?.startsWith(`${path}\\`)) {
        setActivePath(null);
      }
      setError(null);
    } catch (deleteError) {
      setError(String(deleteError));
    }
  };

  const renderNode = (node: Node, depth = 0) => {
    const isExpanded = expanded[node.path];
    const isActive = activePath === node.path;

    return (
      <div key={node.path} className="explorer-node" style={{ paddingLeft: 12 + depth * 12 }}>
        <div className={`explorer-item ${isActive ? "active" : ""}`}>
          {node.isDirectory ? (
            <button className="explorer-toggle" onClick={() => void expandPath(node)}>
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="explorer-toggle" />
          )}
          <button className="explorer-label" onClick={() => onSelectFile(node)}>
            {node.name}
          </button>
          <div className="explorer-actions">
            {!node.isDirectory && (
              <button className="icon-button" title="Rename" onClick={() => startRename(node.path)}>
                ✎
              </button>
            )}
            <button className="icon-button" title="Delete" onClick={() => confirmDelete(node.path)}>
              🗑
            </button>
          </div>
        </div>
        {node.isDirectory && isExpanded && node.children && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  const renderEditor = () => {
    if (editorMode === "create") {
      return (
        <div className="explorer-create">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New file name"
            autoFocus
          />
          <div className="explorer-create-actions">
            <button onClick={confirmCreate}>Create</button>
            <button onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      );
    }

    if (editorMode === "rename") {
      return (
        <div className="explorer-create">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New name"
            autoFocus
          />
          <div className="explorer-create-actions">
            <button onClick={confirmRename}>Rename</button>
            <button onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      );
    }

    return (
      <div className="explorer-footer">
        <button className="primary" onClick={createFile}>
          New File
        </button>
      </div>
    );
  };

  return (
    <div className="file-explorer">
      <div className="explorer-header">
        <div>
          <strong>Workspace</strong>
        </div>
        <div className="explorer-subtitle">{rootPath}</div>
      </div>
      <div className="explorer-body">
        {tree.map((node) => renderNode(node))}
        {error && <div className="explorer-error">{error}</div>}
        {editorMode !== "none" && renderEditor()}
      </div>
      {editorMode === "none" && renderEditor()}
    </div>
  );
}
