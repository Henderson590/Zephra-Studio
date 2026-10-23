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
        chooseDirectory: () => Promise<string | null>;
      };
      workspace: {
        getSession: () => Promise<{
          rootPath: string | null;
          tabs: Array<{
            id: string;
            filePath: string;
            language: string;
            content: string;
            isDirty: boolean;
            lastSavedContent?: string;
          }>;
          activeTabId: string | null;
          isOutputOpen: boolean;
        } | null>;
        saveSession: (session: {
          rootPath: string | null;
          tabs: Array<{
            id: string;
            filePath: string;
            language: string;
            content: string;
            isDirty: boolean;
            lastSavedContent?: string;
          }>;
          activeTabId: string | null;
          isOutputOpen: boolean;
        }) => Promise<{ success: true } | { error: string }>;
      };
      snapshots: {
        list: (root: string) => Promise<
          | Array<{
              id: string;
              label: string;
              createdAt: string;
              rootPath: string;
              tabs: Array<{
                id: string;
                filePath: string;
                language: string;
                content: string;
                isDirty: boolean;
              }>;
              activeTabId: string | null;
            }>
          | { error: string }
        >;
        create: (
          root: string,
          data: {
            tabs: Array<{
              id: string;
              filePath: string;
              language: string;
              content: string;
              isDirty: boolean;
            }>;
            activeTabId: string | null;
            label: string;
          },
        ) => Promise<
          | {
              id: string;
              label: string;
              createdAt: string;
              rootPath: string;
              tabs: Array<{
                id: string;
                filePath: string;
                language: string;
                content: string;
                isDirty: boolean;
              }>;
              activeTabId: string | null;
            }
          | { error: string }
        >;
        remove: (
          root: string,
          snapshotId: string,
        ) => Promise<{ success: true } | { error: string }>;
      };
      projectSnapshots: {
        list: (root: string) => Promise<
          | Array<{
              id: string;
              label: string;
              createdAt: string;
              rootPath: string;
              archiveName: string;
              fileCount: number;
              totalBytes: number;
              archiveBytes: number;
              skippedSymlinks: number;
            }>
          | { error: string }
        >;
        create: (
          root: string,
          label: string,
        ) => Promise<
          | {
              id: string;
              label: string;
              createdAt: string;
              rootPath: string;
              archiveName: string;
              fileCount: number;
              totalBytes: number;
              archiveBytes: number;
              skippedSymlinks: number;
            }
          | { error: string }
        >;
        restore: (
          root: string,
          snapshotId: string,
          parentPath: string,
          folderName: string,
        ) => Promise<
          | { path: string; fileCount: number; totalBytes: number }
          | { error: string }
        >;
        remove: (
          root: string,
          snapshotId: string,
        ) => Promise<{ success: true } | { error: string }>;
      };
      languageTools: {
        detect: (configuredPaths: Record<string, string>) => Promise<
          Array<{
            id: string;
            language: string;
            role: string;
            command: string;
            hint: string;
            configuredPath: string;
            resolvedPath: string | null;
            available: boolean;
          }>
        >;
      };
      terminal: {
        start: (
          cwd: string,
          dimensions?: { cols: number; rows: number },
        ) => Promise<{ id: string } | { error: string }>;
        write: (
          id: string,
          input: string,
        ) => Promise<{ success: true } | { error: string }>;
        resize: (
          id: string,
          dimensions: { cols: number; rows: number },
        ) => Promise<{ success: true } | { error: string }>;
        stop: (id: string) => Promise<{ success: true } | { error: string }>;
      };
      minecraft: {
        listVersions: () => Promise<
          Array<{
            version: string;
            resourcePackFormat: number;
            dataPackFormat: number;
            dataFunctionDirectory: string;
            modLoaders: Array<"fabric" | "forge" | "neoforge">;
            javaVersion?: number;
          }>
        >;
        createProject: (options: {
          type: "resource-pack" | "data-pack" | "mod";
          modLoader?: "fabric" | "forge" | "neoforge";
          name: string;
          namespace: string;
          description: string;
          minecraftVersion: string;
          destination: string;
        }) => Promise<
          | {
              success: true;
              path: string;
              type: string;
              modLoader?: "fabric" | "forge" | "neoforge";
            }
          | { error: string }
        >;
        validatePack: (
          root: string,
          options: {
            type: "resource-pack" | "data-pack";
            minecraftVersion: string;
          },
        ) => Promise<
          | {
              root: string;
              type: "resource-pack" | "data-pack" | null;
              minecraftVersion: string | null;
              fileCount: number;
              valid: boolean;
              errors: string[];
              warnings: string[];
            }
          | { error: string }
        >;
        analyzeCrashLog: () => Promise<
          | {
              findingCount: number;
              summary: string;
              findings: Array<{
                severity: "high" | "medium";
                title: string;
                line: number;
                excerpt: string;
                guidance: string;
              }>;
            }
          | { error: string }
          | null
        >;
      };
      tests: {
        discover: (root: string) => Promise<
          | Array<{
              id: string;
              label: string;
              runner: "npm" | "python" | "gradle";
            }>
          | { error: string }
        >;
        run: (
          root: string,
          targetId: string,
        ) => Promise<{ id: string } | { error: string }>;
        stop: (id: string) => Promise<{ success: true } | { error: string }>;
      };
      debug: {
        start: (options: {
          rootPath: string;
          command: string;
          args: string[];
        }) => Promise<{ id: string } | { error: string }>;
        send: (
          id: string,
          message: Record<string, unknown>,
        ) => Promise<{ success: true } | { error: string }>;
        stop: (id: string) => Promise<{ success: true } | { error: string }>;
      };
      languageServer: {
        start: (options: {
          rootPath: string;
          command: string;
          args: string[];
          languageId: string;
        }) => Promise<{ id: string } | { error: string }>;
        send: (
          id: string,
          message: Record<string, unknown>,
        ) => Promise<{ success: true } | { error: string }>;
        stop: (id: string) => Promise<{ success: true } | { error: string }>;
      };
      fs: {
        readDir: (dir: string) => Promise<any>;
        readFile: (
          filePath: string,
        ) => Promise<{ data: string } | { error: string }>;
        writeFile: (filePath: string, contents: string) => Promise<any>;
        delete: (path: string) => Promise<any>;
        rename: (oldPath: string, newPath: string) => Promise<any>;
        stat: (path: string) => Promise<any>;
        watch: (path: string) => Promise<any>;
        unwatch: (path: string) => Promise<any>;
        openPath: (path: string) => Promise<any>;
      };
      addonApi: {
        workspaceRead: (
          root: string,
          relativePath: string,
        ) => Promise<{ data: string } | { error: string }>;
        workspaceWrite: (
          root: string,
          relativePath: string,
          contents: string,
        ) => Promise<{ success: true } | { error: string }>;
      };
      runner: {
        run: (options: {
          path: string;
          language: string;
        }) => Promise<{ id: string }>;
        stop: (id: string) => Promise<any>;
      };
      extensions: {
        list: () => Promise<any>;
        install: () => Promise<any>;
        openFolder: () => Promise<any>;
        load: (addonPath: string) => Promise<any>;
        vsix: {
          list: () => Promise<
            | Array<{
                id: string;
                name: string;
                publisher: string;
                version: string;
                description: string;
                themes: Array<{
                  label: string;
                  uiTheme?: string;
                  path: string;
                }>;
                snippets: Array<{ language: string; path: string }>;
              }>
            | { error: string }
          >;
          install: () => Promise<
            | {
                id: string;
                name: string;
                publisher: string;
                version: string;
                description: string;
                themes: Array<{
                  label: string;
                  uiTheme?: string;
                  path: string;
                }>;
                snippets: Array<{ language: string; path: string }>;
              }
            | { error: string }
            | null
          >;
          load: (id: string, version: string) => Promise<any>;
          remove: (
            id: string,
            version: string,
          ) => Promise<{ success: true } | { error: string }>;
        };
      };
      git: {
        status: (root: string) => Promise<
          | {
              root: string;
              branch: string;
              branches: string[];
              remotes: string[];
              dirty: boolean;
              files: Array<{
                path: string;
                status: string;
                staged: boolean;
                unstaged: boolean;
              }>;
              stagedCount: number;
            }
          | { error: string }
        >;
        stage: (
          root: string,
          paths: string[],
        ) => ReturnType<Window["zephraStudio"]["git"]["status"]>;
        unstage: (
          root: string,
          paths: string[],
        ) => ReturnType<Window["zephraStudio"]["git"]["status"]>;
        commit: (
          root: string,
          message: string,
        ) => ReturnType<Window["zephraStudio"]["git"]["status"]>;
        createBranch: (
          root: string,
          name: string,
        ) => ReturnType<Window["zephraStudio"]["git"]["status"]>;
        switchBranch: (
          root: string,
          name: string,
        ) => ReturnType<Window["zephraStudio"]["git"]["status"]>;
        fetch: (
          root: string,
          remote: string,
        ) => ReturnType<Window["zephraStudio"]["git"]["status"]>;
        pull: (
          root: string,
          remote: string,
        ) => ReturnType<Window["zephraStudio"]["git"]["status"]>;
        push: (
          root: string,
          remote: string,
        ) => ReturnType<Window["zephraStudio"]["git"]["status"]>;
      };
      search: {
        query: (params: { root: string; query: string }) => Promise<any>;
      };
      openExternal: (url: string) => Promise<any>;
      on: (channel: string, listener: (payload: any) => void) => () => void;
    };
  }
}
