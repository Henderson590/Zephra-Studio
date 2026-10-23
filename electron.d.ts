export {}; // keep as module

declare global {
  interface Window {
    zephraStudio: {
      settings: {
        get: (key?: string) => Promise<any>;
        set: (key: string, value: any) => Promise<any>;
      };
      project: {
        openFolder: () => Promise<string | null>;
        getRecents: () => Promise<string[]>;
      };
      fs: {
        readDir: (dir: string) => Promise<any>;
        readFile: (filePath: string) => Promise<{ data: string } | { error: string }>;
        writeFile: (filePath: string, contents: string) => Promise<any>;
        delete: (path: string) => Promise<any>;
        rename: (oldPath: string, newPath: string) => Promise<any>;
        stat: (path: string) => Promise<any>;
        watch: (path: string) => Promise<any>;
        unwatch: (path: string) => Promise<any>;
        openPath: (path: string) => Promise<any>;
      };
      runner: {
        run: (options: { path: string; language: string }) => Promise<{ id: string }>;
        stop: (id: string) => Promise<any>;
      };
      extensions: {
        list: () => Promise<any>;
        install: () => Promise<any>;
        openFolder: () => Promise<any>;
        load: (addonPath: string) => Promise<any>;
      };
      git: {
        status: (root: string) => Promise<{ branch: string | null; dirty: boolean } | null>;
      };
      search: {
        query: (params: { root: string; query: string }) => Promise<any>;
      };
      openExternal: (url: string) => Promise<any>;
      on: (channel: string, listener: (payload: any) => void) => () => void;
    };
  }
}
