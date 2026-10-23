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
const chokidar = require("chokidar");

const isDev = process.env.NODE_ENV === "development" || process.env.ELECTRON_DEV;
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
      fontFamily: "Menlo, Monaco, 'Courier New', monospace"
    }
  }
});

let mainWindow;
let zephraProcesses = new Map();
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
      enableRemoteModule: false
    }
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

function isPathInside(directory, candidate) {
  const relativePath = path.relative(path.resolve(directory), path.resolve(candidate));
  return relativePath === "" || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath));
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
    stdio: ["pipe", "pipe", "pipe"]
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
    properties: ["openDirectory"]
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

ipcMain.handle("extensions.list", async () => {
  const addons = [];
  const seenPaths = new Set();
  for (const directory of getAddonDirectories()) {
    try {
      await fs.promises.mkdir(directory, { recursive: true });
      const entries = await fs.promises.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".zph") continue;
        const addonPath = path.join(directory, entry.name);
        const resolvedPath = path.resolve(addonPath);
        if (seenPaths.has(resolvedPath)) continue;
        seenPaths.add(resolvedPath);
        addons.push({
          id: `${path.basename(directory)}:${entry.name}`,
          name: path.basename(entry.name, path.extname(entry.name)),
          path: addonPath,
          installed: isPathInside(path.join(app.getPath("userData"), "addons"), addonPath)
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
    filters: [{ name: "Zephra add-on", extensions: ["zph"] }]
  });
  if (result.canceled || result.filePaths.length === 0) return { cancelled: true };

  const sourcePath = result.filePaths[0];
  if (path.extname(sourcePath).toLowerCase() !== ".zph") {
    return { error: "Zephra add-ons must use the .zph file extension." };
  }

  const addonDirectory = path.join(app.getPath("userData"), "addons");
  const destinationPath = path.join(addonDirectory, path.basename(sourcePath));
  try {
    await fs.promises.mkdir(addonDirectory, { recursive: true });
    await fs.promises.copyFile(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
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
      isDirectory: entry.isDirectory()
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
      mtimeMs: stat.mtimeMs
    };
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle("fs.watch", (event, targetPath) => {
  if (fileWatchers.has(targetPath)) return;
  const watcher = chokidar.watch(targetPath, { ignoreInitial: true, depth: 2 });
  watcher.on("all", (eventType, changedPath) => {
    mainWindow.webContents.send("fs.watcher:event", { event: eventType, path: changedPath });
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
      env.PYTHONPATH = [getZephraRuntimeRoot(), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
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
      diagnostics: language === "zephra" ? parseZephraErrors(stderrCache || stdoutCache) : []
    };
    mainWindow?.webContents.send("run.output", output);
    zephraProcesses.delete(id);
  };

  proc.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdoutCache += text;
    mainWindow?.webContents.send("run.output", { id, type: "stdout", data: text });
  });

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderrCache += text;
    mainWindow?.webContents.send("run.output", { id, type: "stderr", data: text });
  });

  proc.on("error", (error) => {
    stderrCache += String(error);
    mainWindow?.webContents.send("run.output", { id, type: "stderr", data: `${error}\n` });
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

ipcMain.handle("extensions.load", (event, addonPath) => {
  const resolvedPath = path.resolve(normalizePath(addonPath));
  const allowedPath = getAddonDirectories().some((directory) => isPathInside(directory, resolvedPath));
  if (!allowedPath || path.extname(resolvedPath).toLowerCase() !== ".zph") {
    return { error: "Only .zph add-ons from the Zephra Studio add-ons folders can be loaded." };
  }

  return new Promise((resolve) => {
    const proc = spawnProcess(
      store.get("pythonPath"),
      ["-m", "zephra", "--studio-addon", resolvedPath],
      {
        cwd: path.dirname(resolvedPath),
        env: {
          PYTHONPATH: [getZephraRuntimeRoot(), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
        }
      }
    );
    let stdout = "";
    let stderr = "";
    let timedOut = false;
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
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (error) => finish({ error: String(error) }));
    proc.on("close", (code) => {
      if (timedOut) {
        finish({ error: "Add-on loading timed out after 15 seconds." });
        return;
      }
      if (code !== 0) {
        finish({ error: stderr.trim() || `Add-on process exited with code ${code}.` });
        return;
      }

      const outputLines = stdout.split(/\r?\n/);
      const commandLineIndex = outputLines.findIndex((line) => line.startsWith("__ZEPHRA_STUDIO_COMMANDS__"));
      if (commandLineIndex < 0) {
        finish({ error: "The add-on did not return a valid Zephra Studio command list.", output: stdout });
        return;
      }

      try {
        const commands = JSON.parse(outputLines[commandLineIndex].slice("__ZEPHRA_STUDIO_COMMANDS__".length));
        if (!Array.isArray(commands)) throw new Error("Command list must be an array.");
        outputLines.splice(commandLineIndex, 1);
        finish({ success: true, commands, output: outputLines.join("\n").trim() });
      } catch (error) {
        finish({ error: `Invalid add-on command data: ${String(error)}`, output: stdout });
      }
    });
  });
});

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
                text: line.trim()
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
    const { exec } = require("child_process");
    const cwd = root;

    const getBranch = () =>
      new Promise((resolve) => {
        exec("git rev-parse --abbrev-ref HEAD", { cwd }, (err, stdout) => {
          if (err) return resolve(null);
          resolve(stdout.trim());
        });
      });

    const getDirty = () =>
      new Promise((resolve) => {
        exec("git status --porcelain", { cwd }, (err, stdout) => {
          if (err) return resolve(false);
          resolve(Boolean(stdout.trim()));
        });
      });

    const [branch, dirty] = await Promise.all([getBranch(), getDirty()]);
    return { branch, dirty };
  } catch {
    return { branch: null, dirty: false };
  }
});

ipcMain.handle("openExternal", (event, url) => {
  shell.openExternal(url);
});

// Minimal error bubbling
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception in main process", error);
});
