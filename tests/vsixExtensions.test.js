const assert = require("node:assert/strict");
const AdmZip = require("adm-zip");
const { test } = require("node:test");
const {
  normalizeEntryPath,
  parseVsixBuffer,
} = require("../app/vsixExtensions");

function makeVsix() {
  const zip = new AdmZip();
  zip.addFile(
    "extension/package.json",
    Buffer.from(
      JSON.stringify({
        publisher: "example",
        name: "sample",
        version: "1.0.0",
        displayName: "Sample",
        contributes: {
          themes: [
            {
              label: "Sample Dark",
              uiTheme: "vs-dark",
              path: "themes/sample.json",
            },
          ],
          snippets: [{ language: "javascript", path: "snippets/js.json" }],
          commands: [{ command: "sample.unsafe", title: "Must not execute" }],
        },
      }),
    ),
  );
  zip.addFile(
    "extension/themes/sample.json",
    Buffer.from(JSON.stringify({ type: "dark", tokenColors: [] })),
  );
  zip.addFile(
    "extension/snippets/js.json",
    Buffer.from(
      JSON.stringify({ log: { prefix: "log", body: "console.log($1)" } }),
    ),
  );
  return zip.toBuffer();
}

test("reads VSIX theme and snippet assets without enabling extension activation code", () => {
  const extension = parseVsixBuffer(makeVsix());
  assert.equal(extension.id, "example.sample");
  assert.equal(extension.themes[0].label, "Sample Dark");
  assert.match(extension.contentFiles["snippets/js.json"], /console\.log/);
  assert.equal("commands" in extension, false);
});

test("rejects invalid manifests and unsafe archive paths", () => {
  const invalidManifest = new AdmZip();
  invalidManifest.addFile("extension/package.json", Buffer.from("{}"));
  assert.throws(
    () => parseVsixBuffer(invalidManifest.toBuffer()),
    /identity fields/,
  );

  const unsafe = new AdmZip();
  unsafe.addFile("../escape.txt", Buffer.from("bad"));
  assert.throws(() => normalizeEntryPath("../escape.txt"), /unsafe file path/);
});
