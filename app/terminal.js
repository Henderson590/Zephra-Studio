function getTerminalShell(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    return {
      command: env.ComSpec || env.COMSPEC || "cmd.exe",
      args: ["/Q", "/D"],
    };
  }

  return {
    command: env.SHELL || "/bin/sh",
    args: [],
  };
}

function validateTerminalInput(input) {
  if (typeof input !== "string") return "Terminal input must be text.";
  if (input.length > 1024 * 1024) return "Terminal input cannot exceed 1 MB.";
  return null;
}

module.exports = { getTerminalShell, validateTerminalInput };
