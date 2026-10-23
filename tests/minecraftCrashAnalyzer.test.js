const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  MAX_CRASH_LOG_BYTES,
  analyzeMinecraftCrashLog,
} = require("../app/minecraftCrashAnalyzer");

test("recognizes common memory, dependency, and mixin failures with line numbers", () => {
  const result = analyzeMinecraftCrashLog(
    [
      "Starting Minecraft",
      "java.lang.OutOfMemoryError: Java heap space",
      "Mixin apply failed net.example.ExampleMixin",
      "ClassNotFoundException: net.example.RequiredLibrary",
    ].join("\n"),
  );

  assert.equal(result.findingCount, 3);
  assert.deepEqual(
    result.findings.map(({ title, line }) => [title, line]),
    [
      ["Java ran out of memory", 2],
      ["Mixin injection failed", 3],
      ["Missing class or dependency", 4],
    ],
  );
  assert.match(result.summary, /clues, not a definitive diagnosis/);
});

test("bounds log input and reports unknown logs without inventing a diagnosis", () => {
  assert.throws(
    () => analyzeMinecraftCrashLog("x".repeat(MAX_CRASH_LOG_BYTES + 1)),
    /2 MB or smaller/,
  );
  assert.equal(
    analyzeMinecraftCrashLog("Game started normally").findingCount,
    0,
  );
  assert.throws(() => analyzeMinecraftCrashLog(null), /must be text/);
});
