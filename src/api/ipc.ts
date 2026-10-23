import { RunOutput } from "../types";

function createMissingApiError(): never {
  throw new Error(
    "zephraStudio API is not available. Ensure the app is running inside Electron with the preload script enabled.",
  );
}

const api = (window as any).zephraStudio || {
  settings: {
    get: () => createMissingApiError(),
    set: () => createMissingApiError(),
  },
  project: {
    openFolder: () => createMissingApiError(),
    getRecents: () => createMissingApiError(),
    chooseDirectory: () => createMissingApiError(),
  },
  workspace: {
    getSession: () => createMissingApiError(),
    saveSession: () => createMissingApiError(),
  },
  snapshots: {
    list: () => createMissingApiError(),
    create: () => createMissingApiError(),
    remove: () => createMissingApiError(),
  },
  projectSnapshots: {
    list: () => createMissingApiError(),
    create: () => createMissingApiError(),
    restore: () => createMissingApiError(),
    remove: () => createMissingApiError(),
  },
  languageTools: {
    detect: () => createMissingApiError(),
  },
  tests: {
    discover: () => createMissingApiError(),
    run: () => createMissingApiError(),
    stop: () => createMissingApiError(),
  },
  debug: {
    start: () => createMissingApiError(),
    send: () => createMissingApiError(),
    stop: () => createMissingApiError(),
  },
  languageServer: {
    start: () => createMissingApiError(),
    send: () => createMissingApiError(),
    stop: () => createMissingApiError(),
  },
  terminal: {
    start: () => createMissingApiError(),
    write: () => createMissingApiError(),
    resize: () => createMissingApiError(),
    stop: () => createMissingApiError(),
  },
  minecraft: {
    listVersions: () => createMissingApiError(),
    createProject: () => createMissingApiError(),
    validatePack: () => createMissingApiError(),
    analyzeCrashLog: () => createMissingApiError(),
  },
  fs: {
    readDir: () => createMissingApiError(),
    readFile: () => createMissingApiError(),
    writeFile: () => createMissingApiError(),
    mkdir: () => createMissingApiError(),
    delete: () => createMissingApiError(),
    rename: () => createMissingApiError(),
    stat: () => createMissingApiError(),
    watch: () => createMissingApiError(),
    unwatch: () => createMissingApiError(),
    openPath: () => createMissingApiError(),
  },
  addonApi: {
    workspaceRead: () => createMissingApiError(),
    workspaceWrite: () => createMissingApiError(),
  },
  runner: {
    run: () => createMissingApiError(),
    stop: () => createMissingApiError(),
  },
  extensions: {
    list: () => createMissingApiError(),
    install: () => createMissingApiError(),
    openFolder: () => createMissingApiError(),
    load: () => createMissingApiError(),
    vsix: {
      list: () => createMissingApiError(),
      install: () => createMissingApiError(),
      load: () => createMissingApiError(),
      remove: () => createMissingApiError(),
    },
  },
  git: {
    status: () => createMissingApiError(),
    stage: () => createMissingApiError(),
    unstage: () => createMissingApiError(),
    commit: () => createMissingApiError(),
    createBranch: () => createMissingApiError(),
    switchBranch: () => createMissingApiError(),
    fetch: () => createMissingApiError(),
    pull: () => createMissingApiError(),
    push: () => createMissingApiError(),
  },
  search: { query: () => createMissingApiError() },
  openExternal: () => createMissingApiError(),
  on: () => createMissingApiError(),
};

export { api };

export type OutputListener = (output: RunOutput) => void;

export function onRunOutput(listener: OutputListener) {
  return api.on("run.output", listener);
}

export function onFsEvent(
  listener: (event: { event: string; path: string }) => void,
) {
  return api.on("fs.watcher:event", listener);
}

export function searchWorkspace(query: string, root: string) {
  return api.search.query({ root, query });
}
