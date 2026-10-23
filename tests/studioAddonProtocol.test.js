const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ADDON_PERMISSIONS,
  MAX_ADDON_COMMANDS,
  MAX_ADDON_OUTPUT_BYTES,
  MAX_ADDON_VIEW_HTML_LENGTH,
  MAX_ADDON_VIEWS,
  validateStudioAddonCommands,
  validateStudioAddonResult,
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
      validCommand({
        id: "example.view",
        action: "open_view",
        value: "settings",
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
  assert.equal(MAX_ADDON_VIEW_HTML_LENGTH, 100_000);
  assert.equal(MAX_ADDON_VIEWS, 10);
  assert.deepEqual(
    [...ADDON_PERMISSIONS].sort(),
    ["ui.notify", "workspace.info", "workspace.read", "workspace.write"].sort(),
  );
});

test("validates add-on views, permission requests, and view command references", () => {
  const result = {
    commands: [
      validCommand({
        id: "view.settings",
        label: "Open Settings",
        action: "open_view",
        value: "settings",
      }),
    ],
    views: [
      {
        id: "settings",
        label: "Settings",
        html: "<h1>Settings</h1>",
      },
    ],
    permissions: ["workspace.read"],
  };
  assert.equal(validateStudioAddonResult(result), null);
  assert.match(
    validateStudioAddonResult({
      ...result,
      permissions: ["system.shell"],
    }),
    /permission request is invalid/,
  );
  assert.match(
    validateStudioAddonResult({
      ...result,
      commands: [validCommand({ action: "open_view", value: "missing" })],
    }),
    /unknown view/,
  );
  assert.match(
    validateStudioAddonResult({
      ...result,
      views: [result.views[0], result.views[0]],
    }),
    /view data is invalid/,
  );
  assert.match(validateStudioAddonResult({ commands: [] }), /invalid shape/);
});
