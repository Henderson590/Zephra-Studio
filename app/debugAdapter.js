const MAX_DAP_MESSAGE_BYTES = 10 * 1024 * 1024;

function encodeDapMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (body.length > MAX_DAP_MESSAGE_BYTES) {
    throw new Error("Debug Adapter Protocol messages cannot exceed 10 MB.");
  }
  return Buffer.concat([
    Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"),
    body,
  ]);
}

class DapMessageReader {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    while (true) {
      const separator = this.buffer.indexOf("\r\n\r\n");
      if (separator < 0) return;
      const headers = this.buffer.subarray(0, separator).toString("ascii");
      const match = headers.match(
        /(?:^|\r\n)Content-Length:\s*(\d+)(?:\r\n|$)/i,
      );
      if (!match) throw new Error("Debug adapter sent an invalid DAP header.");
      const length = Number(match[1]);
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > MAX_DAP_MESSAGE_BYTES
      ) {
        throw new Error("Debug adapter sent an invalid DAP message length.");
      }
      const bodyStart = separator + 4;
      if (this.buffer.length < bodyStart + length) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + length);
      this.buffer = this.buffer.subarray(bodyStart + length);
      let message;
      try {
        message = JSON.parse(body.toString("utf8"));
      } catch (error) {
        throw new Error(`Debug adapter sent invalid JSON: ${String(error)}`);
      }
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        throw new Error("Debug adapter message must be an object.");
      }
      this.onMessage(message);
    }
  }
}

module.exports = {
  DapMessageReader,
  MAX_DAP_MESSAGE_BYTES,
  encodeDapMessage,
};
