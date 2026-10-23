import { RunOutput } from "../types";

function createMissingApiError(): never {
  throw new Error(
    "zephraStudio API is not available. Ensure the app is running inside Electron with the preload script enabled."
  );
}

const api = (window as any).zephraStudio || {
  settings: { get: () => createMissingApiError(), set: () => createMissingApiError() },
  project: { openFolder: () => createMissingApiError(), getRecents: () => createMissingApiError() },
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
    openPath: () => createMissingApiError()
  },
  runner: { run: () => createMissingApiError(), stop: () => createMissingApiError() },
  extensions: {
    list: () => createMissingApiError(),
    install: () => createMissingApiError(),
    openFolder: () => createMissingApiError(),
    load: () => createMissingApiError()
  },
  git: { status: () => createMissingApiError() },
  search: { query: () => createMissingApiError() },
  openExternal: () => createMissingApiError(),
  on: () => createMissingApiError()
};

export { api };

export type OutputListener = (output: RunOutput) => void;

export function onRunOutput(listener: OutputListener) {
  return api.on("run.output", listener);
}

export function onFsEvent(listener: (event: { event: string; path: string }) => void) {
  return api.on("fs.watcher:event", listener);
}

export function searchWorkspace(query: string, root: string) {
  return api.search.query({ root, query });
}
