const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_SNAPSHOT_WORKSPACES,
  MAX_TOTAL_SNAPSHOT_BYTES,
  MAX_WORKSPACE_SNAPSHOTS,
  addWorkspaceSnapshot,
  createWorkspaceSnapshot,
  updateWorkspaceSnapshotsStore,
  validateWorkspaceSnapshot,
} = require("../app/workspaceSnapshots");
const {
  MAX_RECOVERY_BYTES,
  MAX_SESSION_TABS,
} = require("../app/workspaceSession");

function createTabs(count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `tab-${index + 1}`,
    filePath: `C:\\project\\file-${index + 1}.zph`,
    language: "zephra",
    content: `print(${index + 1})`,
    isDirty: index === 0,
  }));
}

test("creates a snapshot containing tab text and validates its workspace", () => {
  const tabs = createTabs(2);
  const snapshot = createWorkspaceSnapshot(
    "C:\\project",
    tabs,
    "tab-1",
    "Before edits",
  );

  assert.equal(snapshot.label, "Before edits");
  assert.equal(snapshot.tabs[0].content, "print(1)");
  assert.equal(snapshot.tabs[0].isDirty, true);
  assert.equal(validateWorkspaceSnapshot(snapshot, "C:\\project"), null);
  assert.match(
    validateWorkspaceSnapshot(snapshot, "C:\\other"),
    /invalid shape/,
  );
});

test("enforces tab count, active tab, and snapshot content limits", () => {
  assert.throws(
    () =>
      createWorkspaceSnapshot(
        "C:\\project",
        createTabs(MAX_SESSION_TABS + 1),
        "tab-1",
      ),
    /invalid shape/,
  );

  const snapshot = createWorkspaceSnapshot(
    "C:\\project",
    createTabs(),
    "tab-1",
  );
  assert.match(
    validateWorkspaceSnapshot(
      { ...snapshot, activeTabId: "missing-tab" },
      "C:\\project",
    ),
    /invalid active tab/,
  );
  assert.match(
    validateWorkspaceSnapshot(
      {
        ...snapshot,
        tabs: [
          { ...snapshot.tabs[0], content: "x".repeat(MAX_RECOVERY_BYTES + 1) },
        ],
      },
      "C:\\project",
    ),
    /20 MB/,
  );
});

test("retains only the newest configured number of snapshots", () => {
  const snapshots = Array.from(
    { length: MAX_WORKSPACE_SNAPSHOTS + 2 },
    (_, id) => ({
      id: String(id),
    }),
  );
  const retained = addWorkspaceSnapshot(snapshots.slice(2), snapshots[1]);

  assert.equal(retained.length, MAX_WORKSPACE_SNAPSHOTS);
  assert.equal(retained[0].id, "1");
});

test("limits snapshot storage to the most recently used workspaces", () => {
  const store = Object.fromEntries(
    Array.from({ length: MAX_SNAPSHOT_WORKSPACES }, (_, index) => [
      `workspace-${index}`,
      [{ id: String(index) }],
    ]),
  );
  const updated = updateWorkspaceSnapshotsStore(store, "new-workspace", [
    { id: "new" },
  ]);

  assert.equal(Object.keys(updated).length, MAX_SNAPSHOT_WORKSPACES);
  assert.equal(updated["workspace-0"], undefined);
  assert.deepEqual(updated["new-workspace"], [{ id: "new" }]);
});

test("prunes oldest snapshots to enforce the aggregate storage limit", () => {
  const halfLimit = Math.floor(MAX_TOTAL_SNAPSHOT_BYTES / 2) + 2048;
  const store = {
    "old-workspace": [
      {
        id: "old",
        createdAt: "2026-01-01T00:00:00.000Z",
        content: "x".repeat(halfLimit),
      },
    ],
  };
  const updated = updateWorkspaceSnapshotsStore(store, "new-workspace", [
    {
      id: "new",
      createdAt: "2026-01-02T00:00:00.000Z",
      content: "y".repeat(halfLimit),
    },
  ]);

  assert.equal(updated["old-workspace"], undefined);
  assert.equal(updated["new-workspace"][0].id, "new");
});
