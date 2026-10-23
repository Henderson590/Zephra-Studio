const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  DapMessageReader,
  MAX_DAP_MESSAGE_BYTES,
  encodeDapMessage,
} = require("../app/debugAdapter");

test("encodes and parses split and consecutive DAP messages", () => {
  const received = [];
  const reader = new DapMessageReader((message) => received.push(message));
  const first = encodeDapMessage({ type: "event", event: "initialized" });
  const second = encodeDapMessage({ type: "response", request_seq: 2 });

  reader.push(first.subarray(0, 8));
  reader.push(Buffer.concat([first.subarray(8), second]));
  assert.deepEqual(received, [
    { type: "event", event: "initialized" },
    { type: "response", request_seq: 2 },
  ]);
});

test("rejects malformed headers, malformed JSON, and oversized messages", () => {
  const reader = new DapMessageReader(() => {});
  assert.throws(
    () => reader.push(Buffer.from("bad\r\n\r\n{}")),
    /invalid DAP header/,
  );
  assert.throws(
    () =>
      new DapMessageReader(() => {}).push(
        Buffer.from("Content-Length: 1\r\n\r\n{"),
      ),
    /invalid JSON/,
  );
  assert.throws(
    () => encodeDapMessage({ value: "x".repeat(MAX_DAP_MESSAGE_BYTES) }),
    /cannot exceed 10 MB/,
  );
});
