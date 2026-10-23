const MAX_ADDON_COMMANDS = 100;
const MAX_ADDON_OUTPUT_BYTES = 1024 * 1024;
const MAX_COMMAND_ID_LENGTH = 80;
const MAX_COMMAND_LABEL_LENGTH = 100;
const MAX_COMMAND_VALUE_LENGTH = 10000;
const COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const COMMAND_ACTIONS = new Set(["notify", "insert_text", "run_current_file"]);

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

module.exports = {
  COMMAND_ACTIONS,
  MAX_ADDON_COMMANDS,
  MAX_ADDON_OUTPUT_BYTES,
  validateStudioAddonCommands,
};
