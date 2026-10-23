const path = require("path");
const { MAX_RECOVERY_BYTES, MAX_SESSION_TABS } = require("./workspaceSession");

const MAX_WORKSPACE_SNAPSHOTS = 5;
const MAX_SNAPSHOT_WORKSPACES = 10;
const MAX_TOTAL_SNAPSHOT_BYTES = 100 * 1024 * 1024;

function validateWorkspaceSnapshot(snapshot, expectedRoot) {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    typeof snapshot.id !== "string" ||
    !snapshot.id ||
    typeof snapshot.label !== "string" ||
    typeof snapshot.createdAt !== "string" ||
    !Number.isFinite(Date.parse(snapshot.createdAt)) ||
    typeof snapshot.rootPath !== "string" ||
    path.resolve(snapshot.rootPath) !== path.resolve(expectedRoot) ||
    !Array.isArray(snapshot.tabs) ||
    snapshot.tabs.length > MAX_SESSION_TABS ||
    (snapshot.activeTabId !== null &&
      typeof snapshot.activeTabId !== "string") ||
    snapshot.tabs.some(
      (tab) =>
        !tab ||
        typeof tab.id !== "string" ||
        typeof tab.filePath !== "string" ||
        typeof tab.language !== "string" ||
        typeof tab.content !== "string" ||
        typeof tab.isDirty !== "boolean",
    )
  ) {
    return "Workspace snapshot has an invalid shape.";
  }

  const ids = new Set(snapshot.tabs.map((tab) => tab.id));
  if (snapshot.activeTabId !== null && !ids.has(snapshot.activeTabId)) {
    return "Workspace snapshot references an invalid active tab.";
  }

  const totalBytes = snapshot.tabs.reduce(
    (total, tab) => total + Buffer.byteLength(tab.content, "utf8"),
    0,
  );
  if (totalBytes > MAX_RECOVERY_BYTES) {
    return "Workspace snapshot exceeds the 20 MB content limit.";
  }
  return null;
}

function createWorkspaceSnapshot(rootPath, tabs, activeTabId, label = "") {
  const createdAt = new Date().toISOString();
  const snapshot = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label: typeof label === "string" ? label.trim().slice(0, 120) : "",
    createdAt,
    rootPath,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      filePath: tab.filePath,
      language: tab.language,
      content: tab.content,
      isDirty: tab.isDirty,
    })),
    activeTabId,
  };
  const validationError = validateWorkspaceSnapshot(snapshot, rootPath);
  if (validationError) throw new Error(validationError);
  return snapshot;
}

function addWorkspaceSnapshot(snapshots, snapshot) {
  const list = Array.isArray(snapshots) ? snapshots : [];
  return [snapshot, ...list].slice(0, MAX_WORKSPACE_SNAPSHOTS);
}

function updateWorkspaceSnapshotsStore(
  snapshotsByWorkspace,
  rootPath,
  snapshots,
) {
  const entries = Object.entries(snapshotsByWorkspace)
    .filter(([root]) => root !== rootPath)
    .map(([root, existing]) => [root, [...existing]]);
  if (snapshots.length > 0) entries.push([rootPath, [...snapshots]]);
  const retained = entries.slice(-MAX_SNAPSHOT_WORKSPACES);
  let totalBytes = retained.reduce(
    (total, [, list]) =>
      total +
      list.reduce(
        (sum, snapshot) => sum + Buffer.byteLength(JSON.stringify(snapshot)),
        0,
      ),
    0,
  );

  while (totalBytes > MAX_TOTAL_SNAPSHOT_BYTES) {
    let oldest = null;
    for (const [root, list] of retained) {
      for (const snapshot of list) {
        const timestamp = Date.parse(snapshot.createdAt) || 0;
        if (!oldest || timestamp < oldest.timestamp) {
          oldest = { root, snapshot, timestamp };
        }
      }
    }
    if (!oldest) break;
    const workspace = retained.find(([root]) => root === oldest.root);
    const index = workspace[1].indexOf(oldest.snapshot);
    totalBytes -= Buffer.byteLength(JSON.stringify(oldest.snapshot));
    workspace[1].splice(index, 1);
    if (workspace[1].length === 0) {
      retained.splice(retained.indexOf(workspace), 1);
    }
  }

  return Object.fromEntries(retained);
}

module.exports = {
  MAX_TOTAL_SNAPSHOT_BYTES,
  MAX_SNAPSHOT_WORKSPACES,
  MAX_WORKSPACE_SNAPSHOTS,
  addWorkspaceSnapshot,
  createWorkspaceSnapshot,
  updateWorkspaceSnapshotsStore,
  validateWorkspaceSnapshot,
};
