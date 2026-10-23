const MAX_ADDON_COMMANDS = 100;
const MAX_ADDON_OUTPUT_BYTES = 1024 * 1024;
const MAX_COMMAND_ID_LENGTH = 80;
const MAX_COMMAND_LABEL_LENGTH = 100;
const MAX_COMMAND_VALUE_LENGTH = 10000;
const COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const COMMAND_ACTIONS = new Set([
  "notify",
  "insert_text",
  "run_current_file",
  "open_view",
]);
const ADDON_PERMISSIONS = new Set([
  "workspace.info",
  "workspace.read",
  "workspace.write",
  "ui.notify",
]);
const MAX_ADDON_VIEWS = 10;
const MAX_ADDON_VIEW_HTML_LENGTH = 100_000;

function validateStudioAddonCommands(commands) {
  if (!Array.isArray(commands)) return "Add-on command list must be an array.";
  if (commands.length > MAX_ADDON_COMMANDS) {
    return `An add-on cannot register more than ${MAX_ADDON_COMMANDS} commands.`;
  }
  const ids = new Set();
  for (const command of commands) {
    if (
      !command ||
      typeof command !== "object" ||
      Array.isArray(command) ||
      typeof command.id !== "string" ||
      typeof command.label !== "string" ||
      typeof command.action !== "string" ||
      typeof command.value !== "string"
    ) {
      return "Add-on command has an invalid shape.";
    }
    if (
      command.id.length === 0 ||
      command.id.length > MAX_COMMAND_ID_LENGTH ||
      !COMMAND_ID_PATTERN.test(command.id)
    ) {
      return "Add-on command ID must use up to 80 letters, numbers, periods, underscores, or hyphens.";
    }
    if (
      command.label.trim().length === 0 ||
      command.label.length > MAX_COMMAND_LABEL_LENGTH
    ) {
      return "Add-on command label must contain 1 to 100 characters.";
    }
    if (!COMMAND_ACTIONS.has(command.action)) {
      return `Unsupported add-on command action '${command.action}'.`;
    }
    if (command.value.length > MAX_COMMAND_VALUE_LENGTH) {
      return "Add-on command value cannot exceed 10000 characters.";
    }
    if (ids.has(command.id)) {
      return `Duplicate add-on command ID '${command.id}'.`;
    }
    ids.add(command.id);
  }
  return null;
}

function validateStudioAddonResult(addonData) {
  if (
    !addonData ||
    typeof addonData !== "object" ||
    Array.isArray(addonData) ||
    !Array.isArray(addonData.commands) ||
    !Array.isArray(addonData.views) ||
    !Array.isArray(addonData.permissions)
  ) {
    return "Add-on response has an invalid shape.";
  }

  const commandError = validateStudioAddonCommands(addonData.commands);
  if (commandError) return commandError;
  const { commands, views, permissions } = addonData;
  if (
    views.length > MAX_ADDON_VIEWS ||
    views.some(
      (view) =>
        !view ||
        typeof view !== "object" ||
        Array.isArray(view) ||
        typeof view.id !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(view.id) ||
        typeof view.label !== "string" ||
        view.label.trim().length === 0 ||
        view.label.length > 100 ||
        typeof view.html !== "string" ||
        view.html.length > MAX_ADDON_VIEW_HTML_LENGTH,
    ) ||
    new Set(views.map((view) => view.id)).size !== views.length
  ) {
    return "Add-on view data is invalid or exceeds its limits.";
  }
  if (
    permissions.length > ADDON_PERMISSIONS.size ||
    permissions.some(
      (permission) =>
        typeof permission !== "string" || !ADDON_PERMISSIONS.has(permission),
    ) ||
    new Set(permissions).size !== permissions.length
  ) {
    return "Add-on permission request is invalid.";
  }
  const viewIds = new Set(views.map((view) => view.id));
  if (
    commands.some(
      (command) =>
        command.action === "open_view" && !viewIds.has(command.value),
    )
  ) {
    return "Add-on command references an unknown view.";
  }
  return null;
}

module.exports = {
  ADDON_PERMISSIONS,
  COMMAND_ACTIONS,
  MAX_ADDON_COMMANDS,
  MAX_ADDON_OUTPUT_BYTES,
  MAX_ADDON_VIEW_HTML_LENGTH,
  MAX_ADDON_VIEWS,
  validateStudioAddonCommands,
  validateStudioAddonResult,
};
