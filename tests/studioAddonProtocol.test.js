const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_ADDON_COMMANDS,
  MAX_ADDON_OUTPUT_BYTES,
  validateStudioAddonCommands,
} = require("../app/studioAddonProtocol");

const validCommand = (overrides = {}) => ({
  id: "example.greet",
  label: "Greet",
  action: "notify",
  value: "Hello",
  ...overrides,
});

test("accepts supported add-on commands", () => {
  assert.equal(
    validateStudioAddonCommands([
      validCommand(),
      validCommand({
        id: "example.insert",
        action: "insert_text",
        value: "// generated",
      }),
      validCommand({
        id: "example.run",
        action: "run_current_file",
        value: "",
      }),
    ]),
    null,
  );
});

test("rejects invalid shapes, IDs, actions, duplicate IDs, and field sizes", () => {
  assert.match(validateStudioAddonCommands({}), /must be an array/);
  assert.match(validateStudioAddonCommands([null]), /invalid shape/);
  assert.match(
    validateStudioAddonCommands([validCommand({ id: "../outside" })]),
    /command ID/,
  );
  assert.match(
    validateStudioAddonCommands([validCommand({ action: "execute" })]),
    /Unsupported.*action/,
  );
  assert.match(
    validateStudioAddonCommands([
      validCommand(),
      validCommand({ label: "Other" }),
    ]),
    /Duplicate/,
  );
  assert.match(
    validateStudioAddonCommands([validCommand({ label: " " })]),
    /label/,
  );
  assert.match(
    validateStudioAddonCommands([validCommand({ value: "x".repeat(10001) })]),
    /value/,
  );
});

test("enforces command-count and output-size limits", () => {
  const commands = Array.from({ length: MAX_ADDON_COMMANDS + 1 }, (_, index) =>
    validCommand({ id: `command.${index}` }),
  );
  assert.match(validateStudioAddonCommands(commands), /more than 100/);
  assert.equal(MAX_ADDON_OUTPUT_BYTES, 1024 * 1024);
});
