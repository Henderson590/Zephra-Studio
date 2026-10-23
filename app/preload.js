const { contextBridge, ipcRenderer } = require("electron");

const api = {
  settings: {
    get: (key) => ipcRenderer.invoke("settings.get", key),
    set: (key, value) => ipcRenderer.invoke("settings.set", key, value)
  },
  project: {
    openFolder: () => ipcRenderer.invoke("project.openFolder"),
    getRecents: () => ipcRenderer.invoke("project.getRecents")
  },
  fs: {
    readDir: (dir) => ipcRenderer.invoke("fs.readDir", dir),
    readFile: (filePath) => ipcRenderer.invoke("fs.readFile", filePath),
    writeFile: (filePath, contents) => ipcRenderer.invoke("fs.writeFile", filePath, contents),
    mkdir: (path) => ipcRenderer.invoke("fs.mkdir", path),
    delete: (path) => ipcRenderer.invoke("fs.delete", path),
    rename: (oldPath, newPath) => ipcRenderer.invoke("fs.rename", oldPath, newPath),
    stat: (path) => ipcRenderer.invoke("fs.stat", path),
    watch: (path) => ipcRenderer.invoke("fs.watch", path),
    unwatch: (path) => ipcRenderer.invoke("fs.unwatch", path),
    openPath: (path) => ipcRenderer.invoke("shell.openPath", path)
  },
  runner: {
    run: (options) => ipcRenderer.invoke("run.script", options),
    stop: (id) => ipcRenderer.invoke("run.stop", id)
  },
  extensions: {
    list: () => ipcRenderer.invoke("extensions.list"),
    install: () => ipcRenderer.invoke("extensions.install"),
    openFolder: () => ipcRenderer.invoke("extensions.openFolder"),
    load: (addonPath) => ipcRenderer.invoke("extensions.load", addonPath)
  },
  git: {
    status: (root) => ipcRenderer.invoke("git.status", root)
  },
  search: {
    query: (params) => ipcRenderer.invoke("search.query", params)
  },
  openExternal: (url) => ipcRenderer.invoke("openExternal", url),
  on: (channel, listener) => {
    const wrapped = (event, payload) => listener(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
};

contextBridge.exposeInMainWorld("zephraStudio", api);
