const { contextBridge, ipcRenderer } = require("electron");

const api = {
  settings: {
    get: (key) => ipcRenderer.invoke("settings.get", key),
    set: (key, value) => ipcRenderer.invoke("settings.set", key, value),
  },
  project: {
    openFolder: () => ipcRenderer.invoke("project.openFolder"),
    getRecents: () => ipcRenderer.invoke("project.getRecents"),
    chooseDirectory: () => ipcRenderer.invoke("project.chooseDirectory"),
  },
  workspace: {
    getSession: () => ipcRenderer.invoke("workspace.getSession"),
    saveSession: (session) =>
      ipcRenderer.invoke("workspace.saveSession", session),
  },
  snapshots: {
    list: (root) => ipcRenderer.invoke("snapshots.list", root),
    create: (root, data) => ipcRenderer.invoke("snapshots.create", root, data),
    remove: (root, snapshotId) =>
      ipcRenderer.invoke("snapshots.remove", root, snapshotId),
  },
  projectSnapshots: {
    list: (root) => ipcRenderer.invoke("projectSnapshots.list", root),
    create: (root, label) =>
      ipcRenderer.invoke("projectSnapshots.create", root, label),
    restore: (root, snapshotId, parentPath, folderName) =>
      ipcRenderer.invoke(
        "projectSnapshots.restore",
        root,
        snapshotId,
        parentPath,
        folderName,
      ),
    remove: (root, snapshotId) =>
      ipcRenderer.invoke("projectSnapshots.remove", root, snapshotId),
  },
  languageTools: {
    detect: (configuredPaths) =>
      ipcRenderer.invoke("languageTools.detect", configuredPaths),
  },
  tests: {
    discover: (root) => ipcRenderer.invoke("tests.discover", root),
    run: (root, targetId) => ipcRenderer.invoke("tests.run", root, targetId),
    stop: (id) => ipcRenderer.invoke("tests.stop", id),
  },
  debug: {
    start: (options) => ipcRenderer.invoke("debug.start", options),
    send: (id, message) => ipcRenderer.invoke("debug.send", id, message),
    stop: (id) => ipcRenderer.invoke("debug.stop", id),
  },
  languageServer: {
    start: (options) => ipcRenderer.invoke("languageServer.start", options),
    send: (id, message) =>
      ipcRenderer.invoke("languageServer.send", id, message),
    stop: (id) => ipcRenderer.invoke("languageServer.stop", id),
  },
  terminal: {
    start: (cwd, dimensions) =>
      ipcRenderer.invoke("terminal.start", cwd, dimensions),
    write: (id, input) => ipcRenderer.invoke("terminal.write", id, input),
    resize: (id, dimensions) =>
      ipcRenderer.invoke("terminal.resize", id, dimensions),
    stop: (id) => ipcRenderer.invoke("terminal.stop", id),
  },
  minecraft: {
    listVersions: () => ipcRenderer.invoke("minecraft.listVersions"),
    createProject: (options) =>
      ipcRenderer.invoke("minecraft.createProject", options),
    validatePack: (root, options) =>
      ipcRenderer.invoke("minecraft.validatePack", root, options),
    analyzeCrashLog: () => ipcRenderer.invoke("minecraft.analyzeCrashLog"),
  },
  fs: {
    readDir: (dir) => ipcRenderer.invoke("fs.readDir", dir),
    readFile: (filePath) => ipcRenderer.invoke("fs.readFile", filePath),
    writeFile: (filePath, contents) =>
      ipcRenderer.invoke("fs.writeFile", filePath, contents),
    mkdir: (path) => ipcRenderer.invoke("fs.mkdir", path),
    delete: (path) => ipcRenderer.invoke("fs.delete", path),
    rename: (oldPath, newPath) =>
      ipcRenderer.invoke("fs.rename", oldPath, newPath),
    stat: (path) => ipcRenderer.invoke("fs.stat", path),
    watch: (path) => ipcRenderer.invoke("fs.watch", path),
    unwatch: (path) => ipcRenderer.invoke("fs.unwatch", path),
    openPath: (path) => ipcRenderer.invoke("shell.openPath", path),
  },
  runner: {
    run: (options) => ipcRenderer.invoke("run.script", options),
    stop: (id) => ipcRenderer.invoke("run.stop", id),
  },
  extensions: {
    list: () => ipcRenderer.invoke("extensions.list"),
    install: () => ipcRenderer.invoke("extensions.install"),
    openFolder: () => ipcRenderer.invoke("extensions.openFolder"),
    load: (addonPath) => ipcRenderer.invoke("extensions.load", addonPath),
    vsix: {
      list: () => ipcRenderer.invoke("extensions.vsix.list"),
      install: () => ipcRenderer.invoke("extensions.vsix.install"),
      load: (id, version) =>
        ipcRenderer.invoke("extensions.vsix.load", id, version),
      remove: (id, version) =>
        ipcRenderer.invoke("extensions.vsix.remove", id, version),
    },
  },
  git: {
    status: (root) => ipcRenderer.invoke("git.status", root),
    stage: (root, paths) => ipcRenderer.invoke("git.stage", root, paths),
    unstage: (root, paths) => ipcRenderer.invoke("git.unstage", root, paths),
    commit: (root, message) => ipcRenderer.invoke("git.commit", root, message),
    createBranch: (root, name) =>
      ipcRenderer.invoke("git.branch.create", root, name),
    switchBranch: (root, name) =>
      ipcRenderer.invoke("git.branch.switch", root, name),
    fetch: (root, remote) =>
      ipcRenderer.invoke("git.remote.fetch", root, remote),
    pull: (root, remote) => ipcRenderer.invoke("git.remote.pull", root, remote),
    push: (root, remote) => ipcRenderer.invoke("git.remote.push", root, remote),
  },
  search: {
    query: (params) => ipcRenderer.invoke("search.query", params),
  },
  openExternal: (url) => ipcRenderer.invoke("openExternal", url),
  on: (channel, listener) => {
    const wrapped = (event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld("zephraStudio", api);
