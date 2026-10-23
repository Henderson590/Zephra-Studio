/*
  Zephra Studio - Electron main process

  This file creates the main application window, sets up IPC bridge for
  file system operations, process execution, and settings management.
*/

const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const Store = require("electron-store");
const { spawn } = require("child_process");
const pty = require("node-pty");
const { DapMessageReader, encodeDapMessage } = require("./debugAdapter");
const chokidar = require("chokidar");
const { createMinecraftProject } = require("./minecraftProject");
const { listMinecraftVersions } = require("./minecraftTemplates");
const { validateMinecraftPack } = require("./minecraftValidator");
const {
  analyzeMinecraftCrashLog,
  MAX_CRASH_LOG_BYTES,
} = require("./minecraftCrashAnalyzer");
const { validateWorkspaceSession } = require("./workspaceSession");
const { detectLanguageTools } = require("./languageTools");
const { discoverTestTargets } = require("./testExplorer");
const { readVsix } = require("./vsixExtensions");
const { getTerminalShell, validateTerminalInput } = require("./terminal");
const {
  commitGitChanges,
  createGitBranch,
  fetchGitRemote,
  getGitStatus,
  pullGitBranch,
  pushGitBranch,
  stageGitFiles,
  switchGitBranch,
  unstageGitFiles,
} = require("./git");
const {
  MAX_WORKSPACE_SNAPSHOTS,
  addWorkspaceSnapshot,
  createWorkspaceSnapshot,
  updateWorkspaceSnapshotsStore,
  validateWorkspaceSnapshot,
} = require("./workspaceSnapshots");
const {
  createProjectSnapshot,
  pruneProjectSnapshotStore,
  restoreProjectSnapshot,
} = require("./projectSnapshots");
const {
  MAX_ADDON_OUTPUT_BYTES,
  validateStudioAddonResult,
} = require("./studioAddonProtocol");
const {
  readWorkspaceFile: readAddonWorkspaceFile,
  writeWorkspaceFile: writeAddonWorkspaceFile,
} = require("./addonWorkspaceApi");

const isDev =
  process.env.NODE_ENV === "development" || process.env.ELECTRON_DEV;
const store = new Store({
  name: "zephra-studio-settings",
  defaults: {
    recentProjects: [],
    windowBounds: { width: 1200, height: 800 },
    theme: "dark",
    autoSave: true,
    pythonPath: "python",
    zephraConfigPath: "",
    editor: {
      tabSize: 2,
      insertSpaces: true,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
    },
  },
});

app.on("before-quit", () => {
  for (const proc of terminalProcesses.values()) proc.kill();
  for (const session of debugProcesses.values()) session.proc.kill();
  for (const session of languageServerProcesses.values()) session.proc.kill();
  terminalProcesses.clear();
  debugProcesses.clear();
  languageServerProcesses.clear();
});

let mainWindow;
let zephraProcesses = new Map();
let testProcesses = new Map();
let terminalProcesses = new Map();
let debugProcesses = new Map();
let languageServerProcesses = new Map();
let fileWatchers = new Map();

function createWindow() {
  const { width, height } = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 650,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-frame-navigate", (details) => {
    if (!details.isMainFrame && details.url !== "about:srcdoc") {
      details.preventDefault();
    }
  });
  mainWindow.webContents.on("will-redirect", (details) => {
    if (!details.isMainFrame) details.preventDefault();
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("close", () => {
    store.set("windowBounds", mainWindow.getBounds());
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- Helpers ---

function normalizePath(p) {
  return p.replace(/\\/g, path.sep);
}

async function resolveWorkspaceDirectory(inputPath) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    throw new Error("A workspace folder is required.");
  }
  const root = path.resolve(normalizePath(inputPath));
  const stat = await fs.promises.stat(root);
  if (!stat.isDirectory()) {
    throw new Error("Workspace path must be a folder.");
  }
  return root;
}

function getWorkspaceSnapshotsStore() {
  const value = store.get("workspaceSnapshots", {});
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stored workspace snapshots have an invalid shape.");
  }

  function getProjectSnapshotsStore() {
    const value = store.get("projectSnapshots", {});
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length > 10
    ) {
      throw new Error("Stored project snapshots have an invalid shape.");
    }
    let totalArchiveBytes = 0;
    for (const [root, snapshots] of Object.entries(value)) {
      if (!Array.isArray(snapshots) || snapshots.length > 5) {
        throw new Error(`Stored project snapshots for ${root} are invalid.`);
      }
      for (const snapshot of snapshots) {
        if (
          !snapshot ||
          typeof snapshot.id !== "string" ||
          !/^[0-9]+-[a-f0-9]{16}$/.test(snapshot.id) ||
          snapshot.archiveName !== `${snapshot.id}.zphsnap` ||
          path.resolve(snapshot.rootPath) !== path.resolve(root) ||
          typeof snapshot.createdAt !== "string" ||
          !Number.isFinite(Date.parse(snapshot.createdAt)) ||
          !Number.isSafeInteger(snapshot.fileCount) ||
          snapshot.fileCount < 0 ||
          !Number.isSafeInteger(snapshot.totalBytes) ||
          snapshot.totalBytes < 0 ||
          !Number.isSafeInteger(snapshot.archiveBytes) ||
          snapshot.archiveBytes < 0 ||
          !Number.isSafeInteger(snapshot.skippedSymlinks) ||
          snapshot.skippedSymlinks < 0
        ) {
          throw new Error(`Stored project snapshot for ${root} is invalid.`);
        }
        if (snapshot.archiveBytes > 50 * 1024 * 1024) {
          throw new Error(
            `Stored project snapshot for ${root} exceeds its size cap.`,
          );
        }
        totalArchiveBytes += snapshot.archiveBytes;
      }
    }
    if (totalArchiveBytes > 250 * 1024 * 1024) {
      throw new Error("Stored project snapshots exceed their total size cap.");
    }
    return value;
  }

  function projectSnapshotArchivePath(archiveName) {
    if (
      typeof archiveName !== "string" ||
      !/^[0-9]+-[a-f0-9]{16}\.zphsnap$/.test(archiveName)
    ) {
      throw new Error("Project snapshot archive name is invalid.");
    }
    return path.join(app.getPath("userData"), "project-snapshots", archiveName);
  }
  for (const [root, snapshots] of Object.entries(value)) {
    if (!Array.isArray(snapshots)) {
      throw new Error(`Stored snapshots for ${root} are invalid.`);
    }
    for (const snapshot of snapshots) {
      const validationError = validateWorkspaceSnapshot(snapshot, root);
      if (validationError) throw new Error(validationError);
    }
  }
  return value;
}

function isPathInside(directory, candidate) {
  const relativePath = path.relative(
    path.resolve(directory),
    path.resolve(candidate),
  );
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

function getAddonDirectories() {
  const appPath = app.getAppPath();
  const bundledAddonsDirectory = appPath.endsWith(".asar")
    ? path.join(path.dirname(appPath), "app.asar.unpacked", "addons")
    : path.join(appPath, "addons");
  return [path.join(app.getPath("userData"), "addons"), bundledAddonsDirectory];
}

function getZephraRuntimeRoot() {
  const appPath = app.getAppPath();
  return appPath.endsWith(".asar")
    ? path.join(path.dirname(appPath), "app.asar.unpacked")
    : appPath;
}

function parseZephraErrors(output) {
  const diagnostics = [];
  const lineRegex = /\[Line\s+(\d+),\s*Col\s*(\d+)\]/i;
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const match = lineRegex.exec(line);
    if (match) {
      const lineNum = parseInt(match[1], 10) - 1;
      const colNum = parseInt(match[2], 10) - 1;
      diagnostics.push({ message: line, line: lineNum, column: colNum });
    }
  }
  return diagnostics;
}

function spawnProcess(command, args, options = {}) {
  const proc = spawn(command, args, {
    env: { ...process.env, ...options.env },
    cwd: options.cwd || process.cwd(),
    shell: options.shell || false,
    stdio: ["pipe", "pipe", "pipe"],
  });

  return proc;
}

// --- IPC handlers ---

ipcMain.handle("settings.get", (event, key) => {
  return key ? store.get(key) : store.store;
});

ipcMain.handle("settings.set", (event, key, value) => {
  store.set(key, value);
  return store.get(key);
});

ipcMain.handle("project.openFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const folder = result.filePaths[0];

  const recents = store.get("recentProjects") || [];
  const existing = recents.find((r) => r === folder);
  if (!existing) {
    store.set("recentProjects", [folder, ...recents].slice(0, 20));
  }

  return folder;
});

ipcMain.handle("project.getRecents", () => {
  return store.get("recentProjects") || [];
});

ipcMain.handle("workspace.getSession", () => {
  return store.get("workspaceSession", null);
});

ipcMain.handle("workspace.saveSession", (event, session) => {
  const validationError = validateWorkspaceSession(session);
  if (validationError) return { error: validationError };

  try {
    store.set("workspaceSession", session);
    return { success: true };
  } catch (error) {
    console.error("Failed to save workspace session:", error);
    return { error: String(error) };
  }
});

ipcMain.handle("snapshots.list", async (event, rootPath) => {
  try {
    const root = await resolveWorkspaceDirectory(rootPath);
    const snapshotsByWorkspace = getWorkspaceSnapshotsStore();
    const snapshots = snapshotsByWorkspace[root] || [];
    if (!Array.isArray(snapshots)) {
      throw new Error("Stored snapshots for this workspace are invalid.");
    }
    for (const snapshot of snapshots) {
      const validationError = validateWorkspaceSnapshot(snapshot, root);
      if (validationError) throw new Error(validationError);
    }
    return snapshots;
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("snapshots.create", async (event, rootPath, data) => {
  try {
    const root = await resolveWorkspaceDirectory(rootPath);
    if (!data || typeof data !== "object") {
      throw new Error("Snapshot data is invalid.");
    }
    const snapshot = createWorkspaceSnapshot(
      root,
      data.tabs,
      data.activeTabId,
      data.label,
    );
    const snapshotsByWorkspace = getWorkspaceSnapshotsStore();
    const snapshots = addWorkspaceSnapshot(
      snapshotsByWorkspace[root],
      snapshot,
    );
    store.set(
      "workspaceSnapshots",
      updateWorkspaceSnapshotsStore(snapshotsByWorkspace, root, snapshots),
    );
    return snapshot;
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("snapshots.remove", async (event, rootPath, snapshotId) => {
  try {
    const root = await resolveWorkspaceDirectory(rootPath);
    if (typeof snapshotId !== "string" || !snapshotId) {
      throw new Error("A valid snapshot ID is required.");
    }
    const snapshotsByWorkspace = getWorkspaceSnapshotsStore();
    const snapshots = snapshotsByWorkspace[root];
    if (!Array.isArray(snapshots)) {
      throw new Error("No snapshots exist for this workspace.");
    }
    const remaining = snapshots.filter(
      (snapshot) => snapshot.id !== snapshotId,
    );
    if (remaining.length === snapshots.length) {
      throw new Error("Snapshot was not found.");
    }
    store.set(
      "workspaceSnapshots",
      updateWorkspaceSnapshotsStore(snapshotsByWorkspace, root, remaining),
    );
    return { success: true };
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("projectSnapshots.list", async (event, rootPath) => {
  try {
    const root = await resolveWorkspaceDirectory(rootPath);
    return getProjectSnapshotsStore()[root] || [];
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle(
  "projectSnapshots.create",
  async (event, rootPath, label = "") => {
    let archivePath;
    try {
      const root = await resolveWorkspaceDirectory(rootPath);
      const snapshotsByWorkspace = getProjectSnapshotsStore();
      const id = `${Date.now()}-${require("crypto").randomBytes(8).toString("hex")}`;
      const archiveName = `${id}.zphsnap`;
      archivePath = projectSnapshotArchivePath(archiveName);
      const snapshot = await createProjectSnapshot(
        root,
        archivePath,
        label,
        id,
      );
      snapshot.archiveName = archiveName;
      const updatedStore = pruneProjectSnapshotStore(
        snapshotsByWorkspace,
        root,
        snapshot,
      );
      store.set("projectSnapshots", updatedStore);
      const retainedIds = new Set(
        Object.values(updatedStore)
          .flat()
          .map((item) => item.id),
      );
      for (const previous of Object.values(snapshotsByWorkspace).flat()) {
        if (!retainedIds.has(previous.id)) {
          try {
            await fs.promises.rm(
              projectSnapshotArchivePath(previous.archiveName),
              { force: true },
            );
          } catch (cleanupError) {
            console.error(
              "Failed to remove pruned project snapshot:",
              cleanupError,
            );
          }
        }
      }
      return updatedStore[root].find((item) => item.id === snapshot.id);
    } catch (error) {
      if (archivePath) await fs.promises.rm(archivePath, { force: true });
      return { error: String(error) };
    }
  },
);

ipcMain.handle(
  "projectSnapshots.restore",
  async (event, rootPath, snapshotId, parentPath, folderName) => {
    try {
      const root = await resolveWorkspaceDirectory(rootPath);
      const parent = await resolveWorkspaceDirectory(parentPath);
      if (
        typeof folderName !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(folderName.trim()) ||
        folderName.trim() === "." ||
        folderName.trim() === ".."
      ) {
        throw new Error(
          "Choose a folder name using letters, numbers, spaces, dots, underscores, or hyphens.",
        );
      }
      const snapshot = (getProjectSnapshotsStore()[root] || []).find(
        (item) => item.id === snapshotId,
      );
      if (!snapshot) throw new Error("Project snapshot was not found.");
      const targetPath = path.resolve(parent, folderName.trim());
      if (!isPathInside(parent, targetPath) || targetPath === parent) {
        throw new Error("Restore destination must be a new child folder.");
      }
      return await restoreProjectSnapshot(
        projectSnapshotArchivePath(snapshot.archiveName),
        root,
        targetPath,
      );
    } catch (error) {
      return { error: String(error) };
    }
  },
);

ipcMain.handle(
  "projectSnapshots.remove",
  async (event, rootPath, snapshotId) => {
    try {
      const root = await resolveWorkspaceDirectory(rootPath);
      const snapshotsByWorkspace = getProjectSnapshotsStore();
      const snapshots = snapshotsByWorkspace[root] || [];
      const target = snapshots.find((snapshot) => snapshot.id === snapshotId);
      if (!target) throw new Error("Project snapshot was not found.");
      const remaining = snapshots.filter(
        (snapshot) => snapshot.id !== snapshotId,
      );
      store.set("projectSnapshots", {
        ...snapshotsByWorkspace,
        [root]: remaining,
      });
      await fs.promises.rm(projectSnapshotArchivePath(target.archiveName), {
        force: true,
      });
      return { success: true };
    } catch (error) {
      return { error: String(error) };
    }
  },
);

ipcMain.handle("languageTools.detect", (event, configuredPaths) => {
  const safePaths =
    configuredPaths && typeof configuredPaths === "object"
      ? configuredPaths
      : {};
  return detectLanguageTools(safePaths, store.get("pythonPath", "python"));
});

ipcMain.handle("tests.discover", async (event, rootPath) => {
  try {
    const root = await resolveWorkspaceDirectory(rootPath);
    return await discoverTestTargets(root);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("tests.run", async (event, rootPath, targetId) => {
  try {
    const root = await resolveWorkspaceDirectory(rootPath);
    const targets = await discoverTestTargets(root);
    const target = targets.find((item) => item.id === targetId);
    if (!target) throw new Error("The selected test target is not available.");

    const id = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let command;
    let args;
    let env = {};
    if (target.runner === "npm") {
      command = process.platform === "win32" ? "npm.cmd" : "npm";
      args = ["run", target.script];
    } else if (target.runner === "python") {
      command = store.get("pythonPath", "python");
      args = ["-m", "unittest", "discover", "-s", target.testDirectory];
      env = {
        PYTHONPATH: [root, process.env.PYTHONPATH]
          .filter(Boolean)
          .join(path.delimiter),
      };
    } else {
      command = process.platform === "win32" ? "gradle.bat" : "gradle";
      args = ["test"];
    }

    const proc = spawnProcess(command, args, {
      cwd: root,
      env,
      shell: target.runner === "npm" || target.runner === "gradle",
    });
    testProcesses.set(id, proc);
    const send = (type, data) =>
      mainWindow?.webContents.send("tests.output", { id, type, data });
    const complete = (code) => {
      if (!testProcesses.has(id)) return;
      testProcesses.delete(id);
      send("exit", code ?? 1);
    };
    proc.stdout.on("data", (chunk) => send("stdout", chunk.toString()));
    proc.stderr.on("data", (chunk) => send("stderr", chunk.toString()));
    proc.on("error", (error) => {
      send("stderr", `${error}\n`);
      complete(1);
    });
    proc.on("exit", (code) => complete(code));
    return { id };
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("tests.stop", (event, id) => {
  const proc = testProcesses.get(id);
  if (!proc) return { error: "The test process is not running." };
  proc.kill();
  testProcesses.delete(id);
  return { success: true };
});

ipcMain.handle("debug.start", async (event, options) => {
  try {
    if (
      !options ||
      typeof options.command !== "string" ||
      !options.command.trim() ||
      !Array.isArray(options.args) ||
      options.args.length > 100 ||
      options.args.some((argument) => typeof argument !== "string")
    ) {
      throw new Error("Debug adapter command or arguments are invalid.");
    }
    const root = await resolveWorkspaceDirectory(options.rootPath);
    const id = `debug-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const proc = spawnProcess(options.command, options.args, {
      cwd: root,
      shell:
        process.platform === "win32" && /\.(?:cmd|bat)$/i.test(options.command),
    });
    const sendOutput = (payload) =>
      mainWindow?.webContents.send("debug.output", { id, ...payload });
    const reader = new DapMessageReader((message) =>
      sendOutput({ type: "message", message }),
    );
    const session = { proc, reader };
    debugProcesses.set(id, session);
    proc.stdout.on("data", (chunk) => {
      try {
        reader.push(chunk);
      } catch (error) {
        sendOutput({ type: "stderr", data: `${String(error)}\n` });
        proc.kill();
      }
    });
    proc.stderr.on("data", (chunk) =>
      sendOutput({ type: "stderr", data: chunk.toString() }),
    );
    proc.on("error", (error) => {
      sendOutput({ type: "stderr", data: `${error}\n` });
    });
    proc.on("exit", (code) => {
      debugProcesses.delete(id);
      sendOutput({ type: "exit", code: code ?? 1 });
    });
    return { id };
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("debug.send", (event, id, message) => {
  const session = debugProcesses.get(id);
  if (!session) return { error: "The debug adapter is not running." };
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { error: "Debug protocol message must be an object." };
  }
  try {
    const frame = encodeDapMessage(message);
    session.proc.stdin.write(frame);
    return { success: true };
  } catch (error) {
    return { error: `Could not send debug protocol message: ${String(error)}` };
  }
});

ipcMain.handle("debug.stop", (event, id) => {
  const session = debugProcesses.get(id);
  if (!session) return { error: "The debug adapter is not running." };
  session.proc.kill();
  debugProcesses.delete(id);
  return { success: true };
});

ipcMain.handle("languageServer.start", async (event, options) => {
  try {
    if (
      !options ||
      typeof options.command !== "string" ||
      !options.command.trim() ||
      !Array.isArray(options.args) ||
      options.args.length > 100 ||
      options.args.some((argument) => typeof argument !== "string") ||
      typeof options.languageId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(options.languageId)
    ) {
      throw new Error("Language server command or options are invalid.");
    }
    const root = await resolveWorkspaceDirectory(options.rootPath);
    const id = `lsp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const proc = spawnProcess(options.command, options.args, {
      cwd: root,
      shell:
        process.platform === "win32" && /\.(?:cmd|bat)$/i.test(options.command),
    });
    const sendOutput = (payload) =>
      mainWindow?.webContents.send("languageServer.output", { id, ...payload });
    const reader = new DapMessageReader((message) =>
      sendOutput({ type: "message", message }),
    );
    languageServerProcesses.set(id, { proc, reader });
    proc.stdout.on("data", (chunk) => {
      try {
        reader.push(chunk);
      } catch (error) {
        sendOutput({ type: "stderr", data: `${String(error)}\n` });
        proc.kill();
      }
    });
    proc.stderr.on("data", (chunk) =>
      sendOutput({ type: "stderr", data: chunk.toString() }),
    );
    proc.on("error", (error) =>
      sendOutput({ type: "stderr", data: `${error}\n` }),
    );
    proc.on("exit", (code) => {
      languageServerProcesses.delete(id);
      sendOutput({ type: "exit", code: code ?? 1 });
    });
    return { id };
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("languageServer.send", (event, id, message) => {
  const session = languageServerProcesses.get(id);
  if (!session) return { error: "The language server is not running." };
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { error: "Language server protocol message must be an object." };
  }
  try {
    session.proc.stdin.write(encodeDapMessage(message));
    return { success: true };
  } catch (error) {
    return { error: `Could not send LSP message: ${String(error)}` };
  }
});

ipcMain.handle("languageServer.stop", (event, id) => {
  const session = languageServerProcesses.get(id);
  if (!session) return { error: "The language server is not running." };
  session.proc.kill();
  languageServerProcesses.delete(id);
  return { success: true };
});

ipcMain.handle("terminal.start", (event, workingDirectory, dimensions = {}) => {
  const cwd =
    typeof workingDirectory === "string" && workingDirectory.trim()
      ? path.resolve(normalizePath(workingDirectory))
      : app.getPath("home");
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    return { error: `Terminal folder does not exist: ${cwd}` };
  }

  const { command, args } = getTerminalShell();
  const id = `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let proc;
  try {
    const cols = Number.isInteger(dimensions.cols)
      ? Math.max(20, Math.min(300, dimensions.cols))
      : 100;
    const rows = Number.isInteger(dimensions.rows)
      ? Math.max(5, Math.min(120, dimensions.rows))
      : 30;
    proc = pty.spawn(command, args, {
      cwd,
      env: process.env,
      cols,
      rows,
      name: "xterm-256color",
    });
  } catch (error) {
    return { error: `Could not start terminal: ${String(error)}` };
  }
  terminalProcesses.set(id, proc);

  const complete = (code) => {
    if (!terminalProcesses.has(id)) return;
    terminalProcesses.delete(id);
    mainWindow?.webContents.send("terminal.output", {
      id,
      type: "exit",
      code: code ?? 1,
    });
  };
  proc.onData((data) => {
    mainWindow?.webContents.send("terminal.output", {
      id,
      type: "stdout",
      data,
    });
  });
  proc.onExit(({ exitCode }) => complete(exitCode));

  return { id };
});

ipcMain.handle("terminal.write", (event, id, input) => {
  const validationError = validateTerminalInput(input);
  if (validationError) return { error: validationError };
  const proc = terminalProcesses.get(id);
  if (!proc) {
    return { error: "The terminal shell is not running." };
  }
  try {
    proc.write(input);
    return { success: true };
  } catch (error) {
    return { error: `Could not write to the terminal: ${String(error)}` };
  }
});

ipcMain.handle("terminal.resize", (event, id, dimensions) => {
  const proc = terminalProcesses.get(id);
  if (!proc) return { error: "The terminal shell is not running." };
  const { cols, rows } = dimensions || {};
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 20 ||
    cols > 300 ||
    rows < 5 ||
    rows > 120
  ) {
    return { error: "Terminal dimensions are outside supported limits." };
  }
  try {
    proc.resize(cols, rows);
    return { success: true };
  } catch (error) {
    return { error: `Could not resize the terminal: ${String(error)}` };
  }
});

ipcMain.handle("terminal.stop", (event, id) => {
  const proc = terminalProcesses.get(id);
  if (!proc) return { error: "The terminal shell is not running." };
  proc.kill();
  return { success: true };
});

ipcMain.handle("project.chooseDirectory", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("minecraft.createProject", async (event, options) => {
  try {
    const project = await createMinecraftProject(options);
    return { success: true, ...project };
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("minecraft.listVersions", () => listMinecraftVersions());

ipcMain.handle("minecraft.validatePack", async (event, rootPath, options) => {
  try {
    const root = await resolveWorkspaceDirectory(rootPath);
    return await validateMinecraftPack(root, options);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("minecraft.analyzeCrashLog", async () => {
  try {
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: "Select Minecraft crash report or latest.log",
      properties: ["openFile"],
      filters: [
        { name: "Minecraft logs", extensions: ["log", "txt"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (selection.canceled || selection.filePaths.length === 0) return null;

    const handle = await fs.promises.open(selection.filePaths[0], "r");
    let contents;
    try {
      const stat = await handle.stat();
      if (!stat.isFile())
        throw new Error("The selected crash log is not a file.");
      if (stat.size > MAX_CRASH_LOG_BYTES) {
        throw new Error("Crash logs must be 2 MB or smaller.");
      }
      const buffer = Buffer.alloc(MAX_CRASH_LOG_BYTES + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > MAX_CRASH_LOG_BYTES) {
        throw new Error("Crash logs must be 2 MB or smaller.");
      }
      contents = buffer.toString("utf8", 0, bytesRead);
    } finally {
      await handle.close();
    }
    return analyzeMinecraftCrashLog(contents);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("extensions.list", async () => {
  const addons = [];
  const seenPaths = new Set();
  for (const directory of getAddonDirectories()) {
    try {
      await fs.promises.mkdir(directory, { recursive: true });
      const entries = await fs.promises.readdir(directory, {
        withFileTypes: true,
      });
      for (const entry of entries) {
        if (
          !entry.isFile() ||
          path.extname(entry.name).toLowerCase() !== ".zph"
        )
          continue;
        const addonPath = path.join(directory, entry.name);
        const resolvedPath = path.resolve(addonPath);
        if (seenPaths.has(resolvedPath)) continue;
        seenPaths.add(resolvedPath);
        addons.push({
          id: `${path.basename(directory)}:${entry.name}`,
          name: path.basename(entry.name, path.extname(entry.name)),
          path: addonPath,
          installed: isPathInside(
            path.join(app.getPath("userData"), "addons"),
            addonPath,
          ),
        });
      }
    } catch (error) {
      console.error(`Failed to list Zephra add-ons in ${directory}:`, error);
      return { error: String(error) };
    }
  }
  return addons.sort((a, b) => a.name.localeCompare(b.name));
});

ipcMain.handle("extensions.install", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Zephra add-on", extensions: ["zph"] }],
  });
  if (result.canceled || result.filePaths.length === 0)
    return { cancelled: true };

  const sourcePath = result.filePaths[0];
  if (path.extname(sourcePath).toLowerCase() !== ".zph") {
    return { error: "Zephra add-ons must use the .zph file extension." };
  }

  const addonDirectory = path.join(app.getPath("userData"), "addons");
  const destinationPath = path.join(addonDirectory, path.basename(sourcePath));
  try {
    const sourceStat = await fs.promises.stat(sourcePath);
    if (!sourceStat.isFile()) return { error: "Select a .zph add-on file." };
    if (sourceStat.size > MAX_ADDON_OUTPUT_BYTES) {
      return { error: "Add-on source files cannot exceed 1 MB." };
    }
    await fs.promises.mkdir(addonDirectory, { recursive: true });
    await fs.promises.copyFile(
      sourcePath,
      destinationPath,
      fs.constants.COPYFILE_EXCL,
    );
    return { success: true, path: destinationPath };
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("extensions.openFolder", async () => {
  const addonDirectory = path.join(app.getPath("userData"), "addons");
  await fs.promises.mkdir(addonDirectory, { recursive: true });
  const error = await shell.openPath(addonDirectory);
  return error ? { error } : { success: true, path: addonDirectory };
});

ipcMain.handle("fs.readDir", async (event, dir) => {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }));
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle("fs.readFile", async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, "utf8");
    return { data };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle("fs.writeFile", async (event, filePath, contents) => {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, contents, "utf8");
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle("fs.mkdir", async (event, dirPath) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle("fs.delete", async (event, targetPath) => {
  try {
    const stat = await fs.promises.stat(targetPath);
    if (stat.isDirectory()) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(targetPath);
    }
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle("fs.rename", async (event, oldPath, newPath) => {
  try {
    await fs.promises.mkdir(path.dirname(newPath), { recursive: true });
    await fs.promises.rename(oldPath, newPath);
    return { success: true };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle("fs.stat", async (event, targetPath) => {
  try {
    const stat = await fs.promises.stat(targetPath);
    return {
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle("fs.watch", (event, targetPath) => {
  if (fileWatchers.has(targetPath)) return;
  const watcher = chokidar.watch(targetPath, { ignoreInitial: true });
  watcher.on("all", (eventType, changedPath) => {
    mainWindow.webContents.send("fs.watcher:event", {
      event: eventType,
      path: changedPath,
    });
  });
  fileWatchers.set(targetPath, watcher);
});

ipcMain.handle("fs.unwatch", (event, targetPath) => {
  const watcher = fileWatchers.get(targetPath);
  if (!watcher) return;
  watcher.close();
  fileWatchers.delete(targetPath);
});

ipcMain.handle("shell.openPath", async (event, targetPath) => {
  return await shell.openPath(targetPath);
});

ipcMain.handle("run.script", (event, options) => {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const { path: filePath, args = [], cwd, language } = options;

  let command = "";
  let commandArgs = [];
  const env = {};
  const pythonPath = store.get("pythonPath");

  switch (language) {
    case "zephra":
      command = pythonPath;
      commandArgs = ["-m", "zephra", filePath];
      if (store.get("zephraConfigPath")) {
        commandArgs.push("--config", store.get("zephraConfigPath"));
      }
      env.PYTHONPATH = [getZephraRuntimeRoot(), process.env.PYTHONPATH]
        .filter(Boolean)
        .join(path.delimiter);
      break;
    case "python":
      command = pythonPath;
      commandArgs = [filePath, ...args];
      break;
    case "javascript":
      command = process.execPath;
      commandArgs = [filePath, ...args];
      env.ELECTRON_RUN_AS_NODE = "1";
      break;
    case "cpp":
      command = "g++";
      commandArgs = [filePath, "-o", `${filePath}.out`];
      break;
    default:
      command = pythonPath;
      commandArgs = [filePath, ...args];
      break;
  }

  const runCwd = cwd || path.dirname(filePath);
  const proc = spawnProcess(command, commandArgs, { cwd: runCwd, env });
  zephraProcesses.set(id, proc);

  let stderrCache = "";
  let stdoutCache = "";
  let finished = false;
  const complete = (code) => {
    if (finished) return;
    finished = true;
    const output = {
      id,
      type: "exit",
      code,
      diagnostics:
        language === "zephra"
          ? parseZephraErrors(stderrCache || stdoutCache)
          : [],
    };
    mainWindow?.webContents.send("run.output", output);
    zephraProcesses.delete(id);
  };

  proc.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdoutCache += text;
    mainWindow?.webContents.send("run.output", {
      id,
      type: "stdout",
      data: text,
    });
  });

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderrCache += text;
    mainWindow?.webContents.send("run.output", {
      id,
      type: "stderr",
      data: text,
    });
  });

  proc.on("error", (error) => {
    stderrCache += String(error);
    mainWindow?.webContents.send("run.output", {
      id,
      type: "stderr",
      data: `${error}\n`,
    });
    complete(1);
  });
  proc.on("exit", (code) => complete(code ?? 1));

  return { id };
});

ipcMain.handle("run.stop", (event, id) => {
  const proc = zephraProcesses.get(id);
  if (!proc) return { error: "No process" };
  proc.kill();
  zephraProcesses.delete(id);
  return { success: true };
});

ipcMain.handle("extensions.load", async (event, addonPath) => {
  const resolvedPath = path.resolve(normalizePath(addonPath));
  let addonRealPath;
  try {
    addonRealPath = await fs.promises.realpath(resolvedPath);
    const allowedDirectories = await Promise.all(
      getAddonDirectories().map((directory) =>
        fs.promises.realpath(directory).catch(() => null),
      ),
    );
    const allowedPath = allowedDirectories.some(
      (directory) => directory && isPathInside(directory, addonRealPath),
    );
    if (!allowedPath || path.extname(addonRealPath).toLowerCase() !== ".zph") {
      return {
        error:
          "Only .zph add-ons from the Zephra Studio add-ons folders can be loaded.",
      };
    }
    const addonStat = await fs.promises.stat(addonRealPath);
    if (!addonStat.isFile()) return { error: "Add-on path must be a file." };
    if (addonStat.size > MAX_ADDON_OUTPUT_BYTES) {
      return { error: "Add-on source files cannot exceed 1 MB." };
    }
  } catch (error) {
    return { error: `Could not access add-on: ${String(error)}` };
  }

  return new Promise((resolve) => {
    const proc = spawnProcess(
      store.get("pythonPath"),
      ["-m", "zephra", "--studio-addon", addonRealPath],
      {
        cwd: path.dirname(addonRealPath),
        env: {
          PYTHONPATH: [getZephraRuntimeRoot(), process.env.PYTHONPATH]
            .filter(Boolean)
            .join(path.delimiter),
        },
      },
    );
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputTooLarge = false;
    let completed = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, 15000);

    const finish = (result) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      resolve(result);
    };

    proc.stdout.on("data", (chunk) => {
      if (
        Buffer.byteLength(stdout, "utf8") +
          Buffer.byteLength(stderr, "utf8") +
          chunk.length >
        MAX_ADDON_OUTPUT_BYTES
      ) {
        outputTooLarge = true;
        proc.kill();
        return;
      }
      stdout += chunk.toString();
    });

    function publicVsixInfo(extension) {
      return {
        id: extension.id,
        name: extension.name,
        publisher: extension.publisher,
        version: extension.version,
        description: extension.description,
        themes: extension.themes,
        snippets: extension.snippets,
      };
    }

    function getVsixExtensionsDirectory() {
      return path.join(app.getPath("userData"), "vscode-extensions");
    }

    ipcMain.handle("extensions.vsix.list", async () => {
      try {
        const directory = getVsixExtensionsDirectory();
        await fs.promises.mkdir(directory, { recursive: true });
        const files = await fs.promises.readdir(directory, {
          withFileTypes: true,
        });
        const extensions = [];
        for (const file of files) {
          if (!file.isFile() || !file.name.toLowerCase().endsWith(".vsix"))
            continue;
          try {
            const extension = await readVsix(path.join(directory, file.name));
            extensions.push(publicVsixInfo(extension));
          } catch (error) {
            extensions.push({ id: file.name, error: String(error) });
          }
        }
        return extensions;
      } catch (error) {
        return { error: String(error) };
      }
    });

    ipcMain.handle("extensions.vsix.install", async () => {
      try {
        const selection = await dialog.showOpenDialog(mainWindow, {
          title: "Install VS Code-compatible theme or snippet pack",
          properties: ["openFile"],
          filters: [{ name: "VS Code Extension", extensions: ["vsix"] }],
        });
        if (selection.canceled || selection.filePaths.length === 0) return null;
        const source = selection.filePaths[0];
        const extension = await readVsix(source);
        if (!/^[A-Za-z0-9._-]{1,100}$/.test(extension.version)) {
          throw new Error(
            "VSIX version contains unsupported filename characters.",
          );
        }
        const directory = getVsixExtensionsDirectory();
        await fs.promises.mkdir(directory, { recursive: true });
        const destination = path.join(
          directory,
          `${extension.publisher}.${extension.name}-${extension.version}.vsix`,
        );
        await fs.promises.copyFile(
          source,
          destination,
          fs.constants.COPYFILE_EXCL,
        );
        return publicVsixInfo(extension);
      } catch (error) {
        return { error: String(error) };
      }
    });

    ipcMain.handle(
      "extensions.vsix.load",
      async (event, extensionId, version) => {
        try {
          if (
            typeof extensionId !== "string" ||
            !/^[A-Za-z0-9._-]{1,200}$/.test(extensionId) ||
            typeof version !== "string" ||
            !/^[A-Za-z0-9._-]{1,100}$/.test(version)
          ) {
            throw new Error("VSIX extension identity is invalid.");
          }
          const filePath = path.join(
            getVsixExtensionsDirectory(),
            `${extensionId}-${version}.vsix`,
          );
          const extension = await readVsix(filePath);
          if (extension.id !== extensionId || extension.version !== version) {
            throw new Error(
              "Installed VSIX identity does not match its manifest.",
            );
          }
          return publicVsixInfo(extension);
        } catch (error) {
          return { error: String(error) };
        }
      },
    );

    ipcMain.handle(
      "extensions.vsix.remove",
      async (event, extensionId, version) => {
        try {
          if (
            typeof extensionId !== "string" ||
            !/^[A-Za-z0-9._-]{1,200}$/.test(extensionId) ||
            typeof version !== "string" ||
            !/^[A-Za-z0-9._-]{1,100}$/.test(version)
          ) {
            throw new Error("VSIX extension identity is invalid.");
          }
          await fs.promises.rm(
            path.join(
              getVsixExtensionsDirectory(),
              `${extensionId}-${version}.vsix`,
            ),
          );
          return { success: true };
        } catch (error) {
          return { error: String(error) };
        }
      },
    );
    proc.stderr.on("data", (chunk) => {
      if (
        Buffer.byteLength(stdout, "utf8") +
          Buffer.byteLength(stderr, "utf8") +
          chunk.length >
        MAX_ADDON_OUTPUT_BYTES
      ) {
        outputTooLarge = true;
        proc.kill();
        return;
      }
      stderr += chunk.toString();
    });
    proc.on("error", (error) => finish({ error: String(error) }));
    proc.on("close", (code) => {
      if (timedOut) {
        finish({ error: "Add-on loading timed out after 15 seconds." });
        return;
      }
      if (outputTooLarge) {
        finish({ error: "Add-on output exceeded the 1 MB limit." });
        return;
      }
      if (code !== 0) {
        finish({
          error: stderr.trim() || `Add-on process exited with code ${code}.`,
        });
        return;
      }

      const outputLines = stdout.split(/\r?\n/);
      const commandLineIndex = outputLines.findIndex((line) =>
        line.startsWith("__ZEPHRA_STUDIO_COMMANDS__"),
      );
      if (commandLineIndex < 0) {
        finish({
          error:
            "The add-on did not return a valid Zephra Studio command list.",
          output: stdout,
        });
        return;
      }

      try {
        const addonData = JSON.parse(
          outputLines[commandLineIndex].slice(
            "__ZEPHRA_STUDIO_COMMANDS__".length,
          ),
        );
        const resultError = validateStudioAddonResult(addonData);
        if (resultError) throw new Error(resultError);
        const commands = addonData.commands;
        const views = addonData.views;
        const permissions = addonData.permissions;
        outputLines.splice(commandLineIndex, 1);
        finish({
          success: true,
          commands,
          views,
          permissions,
          output: outputLines.join("\n").trim(),
        });
      } catch (error) {
        finish({
          error: `Invalid add-on command data: ${String(error)}`,
          output: stdout,
        });
      }
    });
  });
});

ipcMain.handle(
  "addonApi.workspace.read",
  async (event, rootPath, relativePath) => {
    try {
      if (
        event.sender !== mainWindow?.webContents ||
        event.senderFrame !== event.sender.mainFrame
      ) {
        throw new Error(
          "Add-on workspace APIs are available only through the Studio main frame.",
        );
      }
      const root = await resolveWorkspaceDirectory(rootPath);
      const data = await readAddonWorkspaceFile(root, relativePath);
      return { data };
    } catch (error) {
      return { error: String(error) };
    }
  },
);

ipcMain.handle(
  "addonApi.workspace.write",
  async (event, rootPath, relativePath, contents) => {
    try {
      if (
        event.sender !== mainWindow?.webContents ||
        event.senderFrame !== event.sender.mainFrame
      ) {
        throw new Error(
          "Add-on workspace APIs are available only through the Studio main frame.",
        );
      }
      const root = await resolveWorkspaceDirectory(rootPath);
      return await writeAddonWorkspaceFile(root, relativePath, contents);
    } catch (error) {
      return { error: String(error) };
    }
  },
);

ipcMain.handle("search.query", async (event, params) => {
  const { root, query } = params;
  const results = [];

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        try {
          const content = await fs.promises.readFile(fullPath, "utf8");
          const lines = content.split(/\r?\n/);
          lines.forEach((line, lineIndex) => {
            if (line.toLowerCase().includes(query.toLowerCase())) {
              results.push({
                path: fullPath,
                line: lineIndex + 1,
                text: line.trim(),
              });
            }
          });
        } catch {
          // skip
        }
      }
    }
  }

  await walk(root);
  return results;
});

ipcMain.handle("git.status", async (event, root) => {
  try {
    return await getGitStatus(root);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("git.stage", async (event, root, paths) => {
  try {
    return await stageGitFiles(root, paths);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("git.unstage", async (event, root, paths) => {
  try {
    return await unstageGitFiles(root, paths);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("git.commit", async (event, root, message) => {
  try {
    return await commitGitChanges(root, message);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("git.branch.create", async (event, root, branchName) => {
  try {
    return await createGitBranch(root, branchName);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("git.branch.switch", async (event, root, branchName) => {
  try {
    return await switchGitBranch(root, branchName);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("git.remote.fetch", async (event, root, remoteName) => {
  try {
    return await fetchGitRemote(root, remoteName);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("git.remote.pull", async (event, root, remoteName) => {
  try {
    return await pullGitBranch(root, remoteName);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("git.remote.push", async (event, root, remoteName) => {
  try {
    return await pushGitBranch(root, remoteName);
  } catch (error) {
    return { error: String(error) };
  }
});

ipcMain.handle("openExternal", (event, url) => {
  shell.openExternal(url);
});

// Minimal error bubbling
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception in main process", error);
});
