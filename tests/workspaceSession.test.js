const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_RECOVERY_BYTES,
  MAX_SESSION_TABS,
  validateWorkspaceSession,
} = require("../app/workspaceSession");

function createSession(overrides = {}) {
  return {
    rootPath: "C:\\project",
    tabs: [
      {
        id: "tab-1",
        filePath: "C:\\project\\main.zph",
        language: "zephra",
        content: "print(1);",
        lastSavedContent: "",
        isDirty: true,
      },
    ],
    activeTabId: "tab-1",
    isOutputOpen: true,
    ...overrides,
  };
}

test("accepts a well-formed recoverable workspace session", () => {
  assert.equal(validateWorkspaceSession(createSession()), null);
});

test("rejects malformed session tabs and active tab state", () => {
  assert.match(
    validateWorkspaceSession(createSession({ tabs: [{ id: "broken" }] })),
    /invalid editor tab/,
  );
  assert.match(
    validateWorkspaceSession(createSession({ isOutputOpen: "yes" })),
    /invalid shape/,
  );
});

test("caps recovered tabs and total unsaved content", () => {
  const template = createSession().tabs[0];
  assert.match(
    validateWorkspaceSession(
      createSession({ tabs: Array(MAX_SESSION_TABS + 1).fill(template) }),
    ),
    /invalid shape/,
  );
  assert.match(
    validateWorkspaceSession(
      createSession({
        tabs: [{ ...template, content: "x".repeat(MAX_RECOVERY_BYTES + 1) }],
      }),
    ),
    /exceeds 20 MB/,
  );
});
