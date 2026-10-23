const MAX_SESSION_TABS = 50;
const MAX_RECOVERY_BYTES = 20 * 1024 * 1024;

function validateWorkspaceSession(session) {
  if (
    !session ||
    (session.rootPath !== null && typeof session.rootPath !== "string") ||
    !Array.isArray(session.tabs) ||
    session.tabs.length > MAX_SESSION_TABS ||
    (session.activeTabId !== null && typeof session.activeTabId !== "string") ||
    typeof session.isOutputOpen !== "boolean"
  ) {
    return "Workspace session has an invalid shape.";
  }

  let totalBytes = 0;
  for (const tab of session.tabs) {
    if (
      !tab ||
      typeof tab.id !== "string" ||
      typeof tab.filePath !== "string" ||
      typeof tab.language !== "string" ||
      typeof tab.content !== "string" ||
      typeof tab.isDirty !== "boolean" ||
      (tab.lastSavedContent !== undefined &&
        typeof tab.lastSavedContent !== "string")
    ) {
      return "Workspace session contains an invalid editor tab.";
    }
    if (tab.isDirty) totalBytes += Buffer.byteLength(tab.content, "utf8");
  }
  if (totalBytes > MAX_RECOVERY_BYTES) {
    return "Unsaved recovery data exceeds 20 MB. Save large files to keep the session recoverable.";
  }

  return null;
}

module.exports = {
  MAX_RECOVERY_BYTES,
  MAX_SESSION_TABS,
  validateWorkspaceSession,
};
