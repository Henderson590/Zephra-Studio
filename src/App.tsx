import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Editor } from "@monaco-editor/react";
import Split from "react-split";
import { api } from "./api/ipc";
import {
  detectLanguageFromPath,
  registerZephraLanguage,
} from "./lib/zephraLanguage";
import {
  FileTab,
  RunOutput,
  StudioAddonCommand,
  WorkspaceSnapshot,
  WorkspaceSession,
} from "./types";
import CommandPalette, { Command } from "./components/CommandPalette";
import SearchPanel from "./components/SearchPanel";
import ZephraLab from "./components/ZephraLab";
import AddonManager from "./components/AddonManager";
import MinecraftDev from "./components/MinecraftDev";
import LanguageTools from "./components/LanguageTools";
import FileExplorer from "./components/FileExplorer";
import StatusBar from "./components/StatusBar";
import OutputPanel from "./components/OutputPanel";
import TerminalPanel from "./components/TerminalPanel";
import GitPanel from "./components/GitPanel";
import WorkspaceSnapshots from "./components/WorkspaceSnapshots";
import TestExplorer from "./components/TestExplorer";
import DebugPanel from "./components/DebugPanel";
import VSCodeExtensionManager from "./components/VSCodeExtensionManager";
import GradlePanel from "./components/GradlePanel";
import { filePathToUri, languageServerTool } from "./lib/languageServer";

import "./styles.css";

function makeNewTab(filePath: string, content: string): FileTab {
  return {
    id: `${filePath}-${Date.now()}`,
    filePath,
    content,
    lastSavedContent: content,
    isDirty: false,
    language: detectLanguageFromPath(filePath),
  };
}

function getBaseName(filePath: string) {
  const parts = filePath.split(/\\|\//);
  return parts[parts.length - 1] || filePath;
}

export default function App() {
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [runOutput, setRunOutput] = useState<RunOutput[]>([]);
  const [isOutputOpen, setIsOutputOpen] = useState(true);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [settings, setSettings] = useState<{
    theme: "light" | "dark";
    autoSave: boolean;
  }>({
    theme: "dark",
    autoSave: true,
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [zephraLabOpen, setZephraLabOpen] = useState(false);
  const [addonManagerOpen, setAddonManagerOpen] = useState(false);
  const [minecraftDevOpen, setMinecraftDevOpen] = useState(false);
  const [languageToolsOpen, setLanguageToolsOpen] = useState(false);
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [testExplorerOpen, setTestExplorerOpen] = useState(false);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [vsixManagerOpen, setVsixManagerOpen] = useState(false);
  const [gradlePanelOpen, setGradlePanelOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [accentColor, setAccentColor] = useState("#60a5fa");
  const [toolbarOrder, setToolbarOrder] = useState([
    "explorer",
    "gradle",
    "sourceControl",
    "terminal",
    "minecraft",
    "theme",
    "customize",
    "addons",
    "languageTools",
    "vsix",
    "tests",
    "debug",
    "snapshots",
  ]);
  const [draggedToolbarItem, setDraggedToolbarItem] = useState<string | null>(
    null,
  );
  const [sidePanel, setSidePanel] = useState<"explorer" | "gradle">("explorer");
  const [rightPanel, setRightPanel] = useState<"output" | "terminal">("output");
  const [layoutSizes, setLayoutSizes] = useState<number[]>([24, 76]);
  const [rightLayoutSizes, setRightLayoutSizes] = useState<number[]>([76, 24]);
  const [newFileRequest, setNewFileRequest] = useState(0);
  const [addonCommands, setAddonCommands] = useState<
    Array<StudioAddonCommand & { addonName: string }>
  >([]);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [gitDirty, setGitDirty] = useState(false);
  const [customMonacoTheme, setCustomMonacoTheme] = useState<string | null>(
    null,
  );
  const snippetsRef = useRef<
    Record<
      string,
      Array<{
        label: string;
        insertText: string;
        description: string;
        extensionId: string;
      }>
    >
  >({});
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const lspProvidersRegisteredRef = useRef(false);
  const lspSessionRef = useRef<{
    id: string;
    rootPath: string;
    languageId: string;
    uri: string;
    content: string;
    version: number;
    ready: boolean;
  } | null>(null);
  const lspSequenceRef = useRef(1);
  const lspPendingRef = useRef(
    new Map<
      number,
      { resolve: (value: unknown) => void; reject: (error: Error) => void }
    >(),
  );
  const [lspStatus, setLspStatus] = useState<string | null>(null);
  const [languageToolsRevision, setLanguageToolsRevision] = useState(0);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionReadyRef = useRef(false);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId),
    [tabs, activeTabId],
  );

  const reportError = useCallback((error: unknown) => {
    setIsTerminalOpen(false);
    setRightPanel("output");
    setIsOutputOpen(true);
    setRunOutput((previous) => [
      ...previous,
      { id: `error-${Date.now()}`, type: "stderr", data: `${String(error)}\n` },
    ]);
  }, []);

  const lspRequest = useCallback(
    async (
      method: string,
      params: Record<string, unknown>,
    ): Promise<unknown> => {
      const session = lspSessionRef.current;
      if (!session) return null;
      const id = lspSequenceRef.current++;
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          lspPendingRef.current.delete(id);
          reject(new Error(`Language server request timed out: ${method}`));
        }, 15_000);
        lspPendingRef.current.set(id, {
          resolve: (value) => {
            clearTimeout(timeout);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });
        void api.languageServer
          .send(session.id, { jsonrpc: "2.0", id, method, params })
          .then((result: { success?: true; error?: string }) => {
            if (result?.error) {
              const pending = lspPendingRef.current.get(id);
              lspPendingRef.current.delete(id);
              pending?.reject(new Error(result.error));
            }
          })
          .catch((error: unknown) => {
            const pending = lspPendingRef.current.get(id);
            lspPendingRef.current.delete(id);
            pending?.reject(new Error(String(error)));
          });
      });
    },
    [],
  );
  const lspRequestRef = useRef(lspRequest);
  lspRequestRef.current = lspRequest;

  const lspNotify = useCallback(
    async (method: string, params: Record<string, unknown>) => {
      const session = lspSessionRef.current;
      if (!session) return;
      const result = await api.languageServer.send(session.id, {
        jsonrpc: "2.0",
        method,
        params,
      });
      if (result?.error) reportError(result.error);
    },
    [reportError],
  );

  const updateGitStatus = useCallback(async (rootPath: string) => {
    const status = await api.git.status(rootPath);
    if ("error" in status) {
      setGitBranch(null);
      setGitDirty(false);
      return;
    }
    setGitBranch(status.branch);
    setGitDirty(status.dirty);
  }, []);

  useEffect(() => {
    const monaco = (window as any).monaco;
    if (monaco && monaco.languages) {
      registerZephraLanguage(monaco);
    }
  }, []);

  useEffect(
    () =>
      api.on(
        "languageServer.output",
        (event: {
          id: string;
          type: "message" | "stderr" | "exit";
          message?: Record<string, any>;
          data?: string;
          code?: number;
        }) => {
          if (event.id !== lspSessionRef.current?.id) return;
          if (event.type === "stderr") {
            setLspStatus(
              event.data?.trim() || "Language server reported an error.",
            );
            return;
          }
          if (event.type === "exit") {
            setLspStatus(`Language server exited (${event.code ?? 1}).`);
            lspSessionRef.current = null;
            for (const pending of lspPendingRef.current.values()) {
              pending.reject(new Error("Language server exited."));
            }
            lspPendingRef.current.clear();
            return;
          }

          const message = event.message;
          if (
            typeof message?.id === "number" &&
            typeof message.method !== "string"
          ) {
            const pending = lspPendingRef.current.get(message.id);
            if (!pending) return;
            lspPendingRef.current.delete(message.id);
            if (message.error) {
              pending.reject(
                new Error(
                  message.error.message || "Language server request failed.",
                ),
              );
            } else {
              pending.resolve(message.result);
            }
            return;
          }
          if (message?.method === "textDocument/publishDiagnostics") {
            const params = message.params;
            if (!params || typeof params.uri !== "string") return;
            const monaco = monacoRef.current;
            const model = monaco?.editor?.getModel(
              monaco.Uri.parse(params.uri),
            );
            if (!model || !Array.isArray(params.diagnostics)) return;
            monaco.editor.setModelMarkers(
              model,
              "lsp",
              params.diagnostics.map((diagnostic: any) => ({
                startLineNumber: (diagnostic.range?.start?.line ?? 0) + 1,
                startColumn: (diagnostic.range?.start?.character ?? 0) + 1,
                endLineNumber: (diagnostic.range?.end?.line ?? 0) + 1,
                endColumn: (diagnostic.range?.end?.character ?? 0) + 1,
                message: diagnostic.message || "Language server diagnostic",
                severity:
                  diagnostic.severity === 1
                    ? monaco.MarkerSeverity.Error
                    : diagnostic.severity === 2
                      ? monaco.MarkerSeverity.Warning
                      : diagnostic.severity === 3
                        ? monaco.MarkerSeverity.Info
                        : monaco.MarkerSeverity.Hint,
                source: diagnostic.source,
              })),
            );
          }
        },
      ),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const [
          theme,
          autoSave,
          recents,
          session,
          savedAccent,
          savedToolbarOrder,
          savedLayout,
          savedRightLayout,
          savedSidePanel,
          savedRightPanel,
        ] = await Promise.all([
          api.settings.get("theme"),
          api.settings.get("autoSave"),
          api.project.getRecents(),
          api.workspace.getSession(),
          api.settings.get("accentColor"),
          api.settings.get("toolbarOrder"),
          api.settings.get("layoutSizes"),
          api.settings.get("rightLayoutSizes"),
          api.settings.get("sidePanel"),
          api.settings.get("rightPanel"),
        ]);
        if (cancelled) return;

        if (theme === "light" || theme === "dark") {
          setSettings((previous) => ({ ...previous, theme }));
        }
        if (typeof autoSave === "boolean") {
          setSettings((previous) => ({ ...previous, autoSave }));
        }
        if (
          typeof savedAccent === "string" &&
          /^#[0-9a-f]{6}$/i.test(savedAccent)
        ) {
          setAccentColor(savedAccent);
        }
        if (Array.isArray(savedToolbarOrder)) {
          const allowed = new Set([
            "explorer",
            "gradle",
            "sourceControl",
            "terminal",
            "minecraft",
            "theme",
            "customize",
            "addons",
            "languageTools",
            "vsix",
            "tests",
            "debug",
            "snapshots",
          ]);
          const valid = savedToolbarOrder.filter(
            (item): item is string =>
              typeof item === "string" && allowed.has(item),
          );
          if (valid.length) setToolbarOrder([...new Set(valid)]);
        }
        if (
          Array.isArray(savedLayout) &&
          savedLayout.length === 2 &&
          savedLayout.every((size) => typeof size === "number" && size > 0)
        ) {
          setLayoutSizes(savedLayout);
        }
        if (
          Array.isArray(savedRightLayout) &&
          savedRightLayout.length === 2 &&
          savedRightLayout.every((size) => typeof size === "number" && size > 0)
        ) {
          setRightLayoutSizes(savedRightLayout);
        }
        if (savedSidePanel === "explorer" || savedSidePanel === "gradle") {
          setSidePanel(savedSidePanel);
        }
        if (savedRightPanel === "output" || savedRightPanel === "terminal") {
          setRightPanel(savedRightPanel);
        }
        if (Array.isArray(recents)) setRecentProjects(recents);

        if (session && typeof session === "object") {
          const restorationWarnings: string[] = [];
          let restoredRoot: string | null = null;
          if (typeof session.rootPath === "string") {
            const rootStat = await api.fs.stat(session.rootPath);
            if (rootStat?.isDirectory) {
              restoredRoot = session.rootPath;
              setWorkspaceRoot(restoredRoot);
            } else {
              restorationWarnings.push(
                `Could not restore workspace ${session.rootPath}: ${rootStat?.error || "folder not found"}.`,
              );
            }
          }

          const savedTabs = Array.isArray(session.tabs) ? session.tabs : [];
          const restoredTabs: FileTab[] = [];
          const missingFiles: string[] = [];
          for (const savedTab of savedTabs) {
            if (
              !savedTab ||
              typeof savedTab.id !== "string" ||
              typeof savedTab.filePath !== "string"
            ) {
              continue;
            }
            try {
              const fileStat = await api.fs.stat(savedTab.filePath);
              if (!fileStat || fileStat.error || fileStat.isDirectory) {
                missingFiles.push(savedTab.filePath);
                continue;
              }
              const file = await api.fs.readFile(savedTab.filePath);
              if (file?.error || typeof file?.data !== "string") {
                missingFiles.push(savedTab.filePath);
                continue;
              }

              const recoveredContent =
                savedTab.isDirty === true &&
                typeof savedTab.content === "string"
                  ? savedTab.content
                  : file.data;
              restoredTabs.push({
                id: savedTab.id,
                filePath: savedTab.filePath,
                language: detectLanguageFromPath(savedTab.filePath),
                content: recoveredContent,
                lastSavedContent: file.data,
                isDirty: recoveredContent !== file.data,
              });
            } catch {
              missingFiles.push(savedTab.filePath);
            }
          }

          if (cancelled) return;
          setTabs(restoredTabs);
          setActiveTabId(
            restoredTabs.some((tab) => tab.id === session.activeTabId)
              ? session.activeTabId
              : (restoredTabs[restoredTabs.length - 1]?.id ?? null),
          );
          if (typeof session.isOutputOpen === "boolean") {
            setIsOutputOpen(session.isOutputOpen);
          }

          const recoveredCount = restoredTabs.filter(
            (tab) => tab.isDirty,
          ).length;
          if (recoveredCount > 0) {
            setIsOutputOpen(true);
            setRunOutput((previous) => [
              ...previous,
              {
                id: `recovery-${Date.now()}`,
                type: "stdout",
                data: `Recovered unsaved changes in ${recoveredCount} file${recoveredCount === 1 ? "" : "s"}. Review and save them when ready.\n`,
              },
            ]);
          }
          if (missingFiles.length > 0) {
            restorationWarnings.push(
              `Could not restore ${missingFiles.length} open file${missingFiles.length === 1 ? "" : "s"} because they are missing or unreadable.`,
            );
          }
          if (session.rootPath && !restoredRoot && savedTabs.length === 0) {
            setWorkspaceRoot(null);
          }
          if (restorationWarnings.length > 0) {
            reportError(restorationWarnings.join("\n"));
          }
        }
      } catch (error) {
        if (!cancelled)
          reportError(
            `Could not restore the previous session: ${String(error)}`,
          );
      } finally {
        if (!cancelled) sessionReadyRef.current = true;
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, [reportError]);

  useEffect(() => {
    if (!sessionReadyRef.current) return;
    const session: WorkspaceSession = {
      rootPath: workspaceRoot,
      tabs: tabs.map((tab) => ({
        id: tab.id,
        filePath: tab.filePath,
        language: tab.language,
        content: tab.isDirty ? tab.content : "",
        isDirty: tab.isDirty,
      })),
      activeTabId,
      isOutputOpen,
    };
    const timer = setTimeout(() => {
      api.workspace
        .saveSession(session)
        .then((result: any) => {
          if (result?.error) reportError(result.error);
        })
        .catch(reportError);
    }, 300);
    return () => clearTimeout(timer);
  }, [workspaceRoot, tabs, activeTabId, isOutputOpen, reportError]);

  useEffect(() => {
    const cleanup = api.on("run.output", (output: RunOutput) => {
      setRunOutput((prev) => [...prev, output]);
      setIsTerminalOpen(false);
      setIsOutputOpen(true);

      if (
        output.type === "exit" &&
        output.diagnostics &&
        output.diagnostics.length &&
        editorRef.current
      ) {
        const monaco = (window as any).monaco;
        const model = editorRef.current.getModel();
        if (model && monaco?.editor) {
          const markers = (output.diagnostics || []).map((diag) => ({
            startLineNumber: diag.line + 1,
            startColumn: diag.column + 1,
            endLineNumber: diag.line + 1,
            endColumn: diag.column + 1,
            message: diag.message,
            severity: monaco.MarkerSeverity.Error,
          }));
          monaco.editor.setModelMarkers(model, "zephra", markers);
        }
      }
    });
    return cleanup;
  }, []);

  useEffect(() => {
    if (!workspaceRoot) return;

    api.fs.watch(workspaceRoot).catch(reportError);
    updateGitStatus(workspaceRoot).catch(reportError);

    let gitRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = api.on("fs.watcher:event", (event: any) => {
      if (
        event.path === workspaceRoot ||
        event.path.startsWith(`${workspaceRoot}/`) ||
        event.path.startsWith(`${workspaceRoot}\\`)
      ) {
        if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
        gitRefreshTimer = setTimeout(
          () => updateGitStatus(workspaceRoot).catch(reportError),
          200,
        );
      }
      if (activeTab && event.path === activeTab.filePath) {
        // reload file if changed externally
        api.fs
          .readFile(activeTab.filePath)
          .then((result: any) => {
            if (result?.error) throw new Error(result.error);
            if (
              result?.data !== undefined &&
              result.data !== activeTab.content &&
              !activeTab.isDirty
            ) {
              setTabs((prev) =>
                prev.map((t) =>
                  t.id === activeTab.id
                    ? {
                        ...t,
                        content: result.data,
                        lastSavedContent: result.data,
                        isDirty: false,
                      }
                    : t,
                ),
              );
            }
          })
          .catch(reportError);
      }
    });
    return () => {
      cleanup();
      if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
      api.fs.unwatch(workspaceRoot).catch(reportError);
    };
  }, [workspaceRoot, activeTab, reportError, updateGitStatus]);

  const openWorkspace = useCallback(async () => {
    const folder = await api.project.openFolder();
    if (!folder) return;
    setWorkspaceRoot(folder);
  }, []);

  const openFile = useCallback(
    async (filePath: string) => {
      const existing = tabs.find((tab) => tab.filePath === filePath);
      if (existing) {
        setActiveTabId(existing.id);
        return existing;
      }

      const result = await api.fs.readFile(filePath);
      if (result.error) {
        throw new Error(result.error);
      }

      const tab = makeNewTab(filePath, result.data);
      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      return tab;
    },
    [tabs],
  );

  const saveTab = useCallback(async (tab: FileTab) => {
    const result = await api.fs.writeFile(tab.filePath, tab.content);
    if (result?.error) throw new Error(result.error);
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tab.id
          ? { ...t, lastSavedContent: tab.content, isDirty: false }
          : t,
      ),
    );

    const monaco = (window as any).monaco;
    if (editorRef.current && monaco?.editor) {
      const model = editorRef.current.getModel();
      if (model) {
        monaco.editor.setModelMarkers(model, "zephra", []);
      }
    }
  }, []);

  const saveActiveTab = useCallback(async () => {
    if (!activeTab) return;
    try {
      await saveTab(activeTab);
    } catch (error) {
      reportError(error);
    }
  }, [activeTab, reportError, saveTab]);

  const saveAllTabs = useCallback(async () => {
    try {
      await Promise.all(
        tabs.map((t) => (t.isDirty ? saveTab(t) : Promise.resolve())),
      );
    } catch (error) {
      reportError(error);
    }
  }, [reportError, saveTab, tabs]);

  const restoreWorkspaceSnapshot = useCallback(
    async (snapshot: WorkspaceSnapshot) => {
      const restoredTabs: FileTab[] = [];
      const unavailableFiles: string[] = [];
      for (const savedTab of snapshot.tabs) {
        try {
          const stat = await api.fs.stat(savedTab.filePath);
          if (!stat || stat.error || stat.isDirectory) {
            unavailableFiles.push(savedTab.filePath);
            continue;
          }
          const file = await api.fs.readFile(savedTab.filePath);
          if (file?.error || typeof file?.data !== "string") {
            unavailableFiles.push(savedTab.filePath);
            continue;
          }
          restoredTabs.push({
            id: savedTab.id,
            filePath: savedTab.filePath,
            language: detectLanguageFromPath(savedTab.filePath),
            content: savedTab.content,
            lastSavedContent: file.data,
            isDirty: savedTab.content !== file.data,
          });
        } catch {
          unavailableFiles.push(savedTab.filePath);
        }
      }
      if (snapshot.tabs.length > 0 && restoredTabs.length === 0) {
        throw new Error("None of the snapshot files are available to restore.");
      }
      setTabs(restoredTabs);
      setActiveTabId(
        restoredTabs.some((tab) => tab.id === snapshot.activeTabId)
          ? snapshot.activeTabId
          : (restoredTabs[restoredTabs.length - 1]?.id ?? null),
      );
      if (unavailableFiles.length) {
        reportError(
          `Skipped ${unavailableFiles.length} missing or unreadable snapshot file${unavailableFiles.length === 1 ? "" : "s"}:\n${unavailableFiles.join("\n")}`,
        );
      }
    },
    [reportError],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const closingTab = tabs.find((tab) => tab.id === tabId);
      if (
        closingTab?.isDirty &&
        !window.confirm(
          `Discard unsaved changes to ${getBaseName(closingTab.filePath)}?`,
        )
      ) {
        return;
      }
      const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
      setTabs((prev) => prev.filter((tab) => tab.id !== tabId));
      if (activeTabId === tabId) {
        const remaining = tabs.filter((tab) => tab.id !== tabId);
        setActiveTabId(remaining[Math.max(0, closingIndex - 1)]?.id ?? null);
      }
    },
    [activeTabId, tabs],
  );

  const handleEditorChange = useCallback(
    (value?: string) => {
      if (!activeTab || value === undefined) return;
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeTab.id
            ? {
                ...tab,
                content: value,
                isDirty: value !== tab.lastSavedContent,
              }
            : tab,
        ),
      );

      if (settings.autoSave) {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
          saveTab({
            ...activeTab,
            content: value,
            isDirty: value !== activeTab.lastSavedContent,
          }).catch(reportError);
        }, 750);
      }
    },
    [activeTab, reportError, saveTab, settings.autoSave],
  );

  const runCurrentFile = useCallback(async () => {
    if (!activeTab) return;
    const language = detectLanguageFromPath(activeTab.filePath);
    setIsTerminalOpen(false);
    setRightPanel("output");
    setIsOutputOpen(true);
    setRunOutput((prev) => [
      ...prev,
      {
        id: "__meta__",
        type: "stdout",
        data: `Running ${activeTab.filePath}...\n`,
      },
    ]);
    try {
      await saveTab(activeTab);
      await api.runner.run({ path: activeTab.filePath, language });
    } catch (error) {
      reportError(error);
    }
  }, [activeTab, reportError, saveTab]);

  const runAddon = useCallback(
    async (addonPath: string) => {
      setIsTerminalOpen(false);
      setRightPanel("output");
      setIsOutputOpen(true);
      setRunOutput((prev) => [
        ...prev,
        {
          id: `addon-${Date.now()}`,
          type: "stdout",
          data: `Running add-on ${addonPath}...\n`,
        },
      ]);
      try {
        const result = await api.extensions.load(addonPath);
        if (!result?.success) {
          throw new Error(result?.error || "The add-on could not be run.");
        }
        if (result.output) {
          setRunOutput((previous) => [
            ...previous,
            {
              id: `addon-output-${Date.now()}`,
              type: "stdout",
              data: `${result.output}\n`,
            },
          ]);
        }
      } catch (error) {
        reportError(error);
      }
    },
    [reportError],
  );

  const registerAddonCommands = useCallback(
    (addonName: string, registered: StudioAddonCommand[]) => {
      const commands = registered.map((command) => ({
        ...command,
        id: `addon:${addonName}:${command.id}`,
        addonName,
      }));
      setAddonCommands((previous) => [
        ...previous.filter((command) => command.addonName !== addonName),
        ...commands,
      ]);
    },
    [],
  );

  const executeAddonCommand = useCallback(
    (command: StudioAddonCommand) => {
      if (command.action === "notify") {
        setIsTerminalOpen(false);
        setRightPanel("output");
        setIsOutputOpen(true);
        setRunOutput((previous) => [
          ...previous,
          {
            id: `addon-command-${Date.now()}`,
            type: "stdout",
            data: `${command.value}\n`,
          },
        ]);
        return;
      }
      if (command.action === "insert_text") {
        const editor = editorRef.current;
        const selection = editor?.getSelection();
        if (!editor || !selection) return;
        editor.executeEdits("zephra-addon", [
          { range: selection, text: command.value, forceMoveMarkers: true },
        ]);
        editor.focus();
        return;
      }
      void runCurrentFile();
    },
    [runCurrentFile],
  );

  const requestNewFile = useCallback(() => {
    setSidePanel("explorer");
    setGradlePanelOpen(false);
    void api.settings.set("sidePanel", "explorer");
    setNewFileRequest((previous) => previous + 1);
  }, []);
  const clearNewFileRequest = useCallback(() => {
    setNewFileRequest(0);
  }, []);

  const navigateToSearchResult = useCallback(
    async (path: string, line: number) => {
      try {
        const tab = await openFile(path);
        if (!tab) return;
        setTimeout(() => {
          if (
            editorRef.current &&
            typeof editorRef.current.revealLineInCenter === "function"
          ) {
            editorRef.current.revealLineInCenter(line);
          }
        }, 150);
      } catch (error) {
        reportError(error);
      }
    },
    [openFile, reportError],
  );

  const commands: Command[] = useMemo(() => {
    const cmd: Command[] = [
      {
        id: "openWorkspace",
        label: "Open Folder...",
        action: openWorkspace,
      },
      {
        id: "newFile",
        label: "File: New File",
        action: requestNewFile,
      },
      {
        id: "save",
        label: "Save File",
        action: saveActiveTab,
      },
      {
        id: "saveAll",
        label: "Save All",
        action: saveAllTabs,
      },
      {
        id: "run",
        label: "Run Current File",
        action: runCurrentFile,
      },
      {
        id: "toggleOutput",
        label: "Toggle Output Panel",
        action: () => {
          setIsTerminalOpen(false);
          setRightPanel("output");
          setIsOutputOpen((v) => !v);
        },
      },
      {
        id: "terminal",
        label: "Terminal: Open Workspace Shell",
        action: () => {
          if (workspaceRoot) {
            setRightPanel("terminal");
            setIsTerminalOpen(true);
          }
        },
      },
      {
        id: "gradle",
        label: "Gradle: Open Task Panel",
        action: () => {
          setSidePanel("gradle");
          setGradlePanelOpen(true);
        },
      },
      {
        id: "sourceControl",
        label: "Git: Open Source Control",
        action: () => {
          if (workspaceRoot) setGitPanelOpen(true);
        },
      },
      {
        id: "editorSnapshots",
        label: "Workspace: Manage Editor Snapshots",
        action: () => {
          if (workspaceRoot) setSnapshotsOpen(true);
        },
      },
      {
        id: "tests",
        label: "Tests: Open Test Explorer",
        action: () => {
          if (workspaceRoot) setTestExplorerOpen(true);
        },
      },
      {
        id: "debug",
        label: "Debug: Open Debugger",
        action: () => {
          if (workspaceRoot) setDebugPanelOpen(true);
        },
      },
      {
        id: "minecraft",
        label: "Minecraft: Open Development Tools",
        action: () => setMinecraftDevOpen(true),
      },
      {
        id: "languageTools",
        label: "Language Tools: Configure language servers",
        action: () => setLanguageToolsOpen(true),
      },
      {
        id: "vsix",
        label: "Extensions: Manage VS Code Contributions",
        action: () => setVsixManagerOpen(true),
      },
      {
        id: "toggleTheme",
        label:
          settings.theme === "dark"
            ? "Switch to Light Theme"
            : "Switch to Dark Theme",
        action: () => {
          const nextTheme = settings.theme === "dark" ? "light" : "dark";
          setSettings((prev) => ({ ...prev, theme: nextTheme }));
          setCustomMonacoTheme(null);
          void api.settings.set("theme", nextTheme);
        },
      },
      {
        id: "customize",
        label: "View: Customize Studio",
        action: () => setCustomizeOpen(true),
      },
      {
        id: "addons",
        label: "Manage Add-ons",
        action: () => setAddonManagerOpen(true),
      },
    ];
    return [
      ...cmd,
      ...addonCommands.map((addonCommand) => ({
        id: addonCommand.id,
        label: `${addonCommand.addonName}: ${addonCommand.label}`,
        action: () => executeAddonCommand(addonCommand),
      })),
    ];
  }, [
    openWorkspace,
    saveActiveTab,
    saveAllTabs,
    runCurrentFile,
    settings.theme,
    addonCommands,
    executeAddonCommand,
    workspaceRoot,
    requestNewFile,
    setRightPanel,
    setIsTerminalOpen,
    setTestExplorerOpen,
    setDebugPanelOpen,
    setMinecraftDevOpen,
    setLanguageToolsOpen,
    setVsixManagerOpen,
    setCustomizeOpen,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveActiveTab();
      }

      if (event.ctrlKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        runCurrentFile();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runCurrentFile, saveActiveTab]);

  const activeLanguage = activeTab
    ? detectLanguageFromPath(activeTab.filePath)
    : "plaintext";
  const activeFileUri = activeTab ? filePathToUri(activeTab.filePath) : null;

  useEffect(() => {
    let cancelled = false;
    const startLanguageServer = async () => {
      const toolConfig = languageServerTool(activeLanguage);
      if (!workspaceRoot || !activeTab || !toolConfig || !activeFileUri) {
        const previous = lspSessionRef.current;
        if (previous) {
          lspSessionRef.current = null;
          await api.languageServer.stop(previous.id);
        }
        setLspStatus(null);
        return;
      }

      const current = lspSessionRef.current;
      if (
        current &&
        current.rootPath === workspaceRoot &&
        current.languageId === activeLanguage
      ) {
        if (!current.ready) {
          current.uri = activeFileUri;
          current.content = activeTab.content;
          return;
        }
        if (current.uri !== activeFileUri) {
          await lspNotify("textDocument/didClose", {
            textDocument: { uri: current.uri },
          });
          current.uri = activeFileUri;
          current.content = activeTab.content;
          current.version = 1;
          await lspNotify("textDocument/didOpen", {
            textDocument: {
              uri: activeFileUri,
              languageId: activeLanguage,
              version: current.version,
              text: activeTab.content,
            },
          });
        }
        return;
      }

      if (current) {
        lspSessionRef.current = null;
        await api.languageServer.stop(current.id);
      }

      try {
        const storedPaths: unknown = await api.settings.get("languageTools");
        const paths =
          storedPaths &&
          typeof storedPaths === "object" &&
          !Array.isArray(storedPaths)
            ? storedPaths
            : {};
        const tools: unknown = await api.languageTools.detect(paths);
        if (!Array.isArray(tools)) {
          throw new Error(
            "Language server discovery returned an invalid result.",
          );
        }
        const serverTool = tools.find(
          (item) => item.id === toolConfig.toolId && item.available,
        );
        if (!serverTool?.resolvedPath) {
          setLspStatus(`No ${activeLanguage} language server detected.`);
          return;
        }
        const command = serverTool.resolvedPath;
        const args = toolConfig.args;
        const result = await api.languageServer.start({
          rootPath: workspaceRoot,
          command,
          args,
          languageId: activeLanguage,
        });
        if (!result || "error" in result) {
          throw new Error(result?.error || "Could not start language server.");
        }
        if (cancelled) {
          await api.languageServer.stop(result.id);
          return;
        }
        const session = {
          id: result.id,
          rootPath: workspaceRoot,
          languageId: activeLanguage,
          uri: activeFileUri,
          content: activeTab.content,
          version: 1,
          ready: false,
        };
        lspSessionRef.current = session;
        const rootUri = filePathToUri(workspaceRoot);
        await lspRequest("initialize", {
          processId: null,
          clientInfo: { name: "Zephra Studio", version: "0.1.0" },
          rootUri,
          rootPath: workspaceRoot,
          workspaceFolders: [
            { uri: rootUri, name: getBaseName(workspaceRoot) },
          ],
          capabilities: {
            textDocument: {
              completion: {
                completionItem: {
                  snippetSupport: true,
                  documentationFormat: ["markdown", "plaintext"],
                },
              },
              hover: { contentFormat: ["markdown", "plaintext"] },
              definition: { linkSupport: true },
              publishDiagnostics: { relatedInformation: true },
            },
            workspace: { workspaceFolders: true },
          },
        });
        if (lspSessionRef.current?.id !== result.id) {
          await api.languageServer.stop(result.id);
          return;
        }
        const activeSession = lspSessionRef.current;
        activeSession.ready = true;
        await lspNotify("initialized", {});
        await lspNotify("textDocument/didOpen", {
          textDocument: {
            uri: activeSession.uri,
            languageId: activeSession.languageId,
            version: activeSession.version,
            text: activeSession.content,
          },
        });
        setLspStatus(`${activeLanguage} language server connected.`);
      } catch (serverError) {
        if (cancelled) return;
        const session = lspSessionRef.current;
        lspSessionRef.current = null;
        if (session) await api.languageServer.stop(session.id);
        setLspStatus(String(serverError));
        reportError(serverError);
      }
    };
    void startLanguageServer();
    return () => {
      cancelled = true;
    };
  }, [
    activeFileUri,
    activeLanguage,
    activeTab?.filePath,
    languageToolsRevision,
    lspNotify,
    lspRequest,
    reportError,
    workspaceRoot,
  ]);

  useEffect(
    () => () => {
      const session = lspSessionRef.current;
      if (session) void api.languageServer.stop(session.id);
      lspSessionRef.current = null;
      for (const pending of lspPendingRef.current.values()) {
        pending.reject(new Error("Language server was stopped."));
      }
      lspPendingRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    const session = lspSessionRef.current;
    if (!session?.ready || !activeTab || session.uri !== activeFileUri) {
      if (session && activeTab && session.uri === activeFileUri) {
        session.content = activeTab.content;
      }
      return;
    }
    session.content = activeTab.content;
    session.version += 1;
    void lspNotify("textDocument/didChange", {
      textDocument: { uri: session.uri, version: session.version },
      contentChanges: [{ text: activeTab.content }],
    });
  }, [activeFileUri, activeTab?.content, lspNotify]);

  const registerLanguageServerProviders = (monaco: any) => {
    monacoRef.current = monaco;
    if (lspProvidersRegisteredRef.current) return;
    lspProvidersRegisteredRef.current = true;
    const languages = [
      "typescript",
      "javascript",
      "python",
      "java",
      "csharp",
      "html",
      "css",
      "json",
      "kotlin",
      "cpp",
      "rust",
      "go",
    ];
    for (const language of languages) {
      monaco.languages.registerCompletionItemProvider(language, {
        provideCompletionItems: async (model: any, position: any) => {
          const response: any = await lspRequestRef.current(
            "textDocument/completion",
            {
              textDocument: { uri: model.uri.toString() },
              position: {
                line: position.lineNumber - 1,
                character: position.column - 1,
              },
            },
          );
          const items = Array.isArray(response)
            ? response
            : (response?.items ?? []);
          const serverItems = Array.isArray(items) ? items : [];
          const completionKinds = monaco.languages.CompletionItemKind;
          const kindMap: Record<number, number> = {
            1: completionKinds.Text,
            2: completionKinds.Method,
            3: completionKinds.Function,
            4: completionKinds.Constructor,
            5: completionKinds.Field,
            6: completionKinds.Variable,
            7: completionKinds.Class,
            8: completionKinds.Interface,
            9: completionKinds.Module,
            10: completionKinds.Property,
            11: completionKinds.Unit,
            12: completionKinds.Value,
            13: completionKinds.Enum,
            14: completionKinds.Keyword,
            15: completionKinds.Snippet,
          };
          const suggestions = serverItems.map((item: any) => ({
            label: item.label,
            kind: kindMap[item.kind] ?? completionKinds.Text,
            insertText: item.insertText ?? item.label,
            insertTextRules:
              item.insertTextFormat === 2
                ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
                : undefined,
            detail: item.detail,
            documentation:
              typeof item.documentation === "string"
                ? item.documentation
                : item.documentation?.value,
            range: item.textEdit
              ? new monaco.Range(
                  item.textEdit.range.start.line + 1,
                  item.textEdit.range.start.character + 1,
                  item.textEdit.range.end.line + 1,
                  item.textEdit.range.end.character + 1,
                )
              : undefined,
          }));
          const snippets = snippetsRef.current[language] ?? [];
          return {
            suggestions: [
              ...suggestions,
              ...snippets.map((snippet) => ({
                label: snippet.label,
                kind: completionKinds.Snippet,
                insertText: snippet.insertText,
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                detail: snippet.extensionId,
                documentation: snippet.description,
              })),
            ],
          };
        },
      });
      monaco.languages.registerHoverProvider(language, {
        provideHover: async (model: any, position: any) => {
          const response: any = await lspRequestRef.current(
            "textDocument/hover",
            {
              textDocument: { uri: model.uri.toString() },
              position: {
                line: position.lineNumber - 1,
                character: position.column - 1,
              },
            },
          );
          if (!response?.contents) return null;
          const contents = Array.isArray(response.contents)
            ? response.contents
            : [response.contents];
          return {
            contents: contents.map((item: any) => ({
              value: typeof item === "string" ? item : (item.value ?? ""),
            })),
          };
        },
      });
      monaco.languages.registerDefinitionProvider(language, {
        provideDefinition: async (model: any, position: any) => {
          const response: any = await lspRequestRef.current(
            "textDocument/definition",
            {
              textDocument: { uri: model.uri.toString() },
              position: {
                line: position.lineNumber - 1,
                character: position.column - 1,
              },
            },
          );
          if (!response) return null;
          const locations = Array.isArray(response) ? response : [response];
          return locations.map((location: any) => {
            const targetUri = location.targetUri ?? location.uri;
            const range =
              location.targetSelectionRange ??
              location.targetRange ??
              location.range;
            return {
              uri: monaco.Uri.parse(targetUri),
              range: new monaco.Range(
                range.start.line + 1,
                range.start.character + 1,
                range.end.line + 1,
                range.end.character + 1,
              ),
            };
          });
        },
      });
    }
  };

  const applyVsCodeTheme = useCallback(
    (name: string, theme: Record<string, any>) => {
      const monaco = monacoRef.current;
      if (!monaco) throw new Error("The editor is not initialized.");
      const rules = Array.isArray(theme.tokenColors)
        ? theme.tokenColors.flatMap((item: any) => {
            const settings = item?.settings;
            if (!settings || typeof settings !== "object") return [];
            const scopes = Array.isArray(item.scope)
              ? item.scope
              : typeof item.scope === "string"
                ? item.scope.split(",")
                : [];
            if (!scopes.length) return [];
            return [
              {
                token: scopes.map((scope: string) => scope.trim()).join(","),
                foreground:
                  typeof settings.foreground === "string"
                    ? settings.foreground.replace(/^#/, "")
                    : undefined,
                fontStyle: settings.fontStyle,
              },
            ];
          })
        : [];
      const colors =
        theme.colors &&
        typeof theme.colors === "object" &&
        !Array.isArray(theme.colors)
          ? Object.fromEntries(
              Object.entries(theme.colors).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            )
          : {};
      const base =
        theme.type === "light"
          ? "vs"
          : theme.type === "hc-light"
            ? "hc-light"
            : theme.type === "hc-black"
              ? "hc-black"
              : "vs-dark";
      const themeName = `vsix-${name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .slice(0, 80)}`;
      monaco.editor.defineTheme(themeName, {
        base,
        inherit: true,
        rules,
        colors,
      });
      setCustomMonacoTheme(themeName);
    },
    [],
  );

  const installVsCodeSnippets = useCallback(
    (
      extension: {
        id: string;
        snippets: Array<{ language: string; path: string }>;
      },
      files: Record<string, string>,
    ) => {
      const next = { ...snippetsRef.current };
      for (const values of Object.values(next)) {
        for (let index = values.length - 1; index >= 0; index -= 1) {
          if (values[index].extensionId === extension.id)
            values.splice(index, 1);
        }
      }
      const aliases: Record<string, string> = {
        js: "javascript",
        javascriptreact: "javascript",
        jsx: "javascript",
        ts: "typescript",
        typescriptreact: "typescript",
        py: "python",
        "c++": "cpp",
        "objective-c": "cpp",
        "objective-cpp": "cpp",
      };
      for (const contribution of extension.snippets) {
        const language =
          aliases[contribution.language] ?? contribution.language;
        const raw = files[contribution.path];
        if (!language || typeof raw !== "string") continue;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(`Snippet file '${contribution.path}' is invalid.`);
        }
        const existing = next[language] ?? [];
        for (const [label, entry] of Object.entries(parsed).slice(0, 200)) {
          if (!entry || typeof entry !== "object") continue;
          const snippet = entry as Record<string, unknown>;
          const prefixes = Array.isArray(snippet.prefix)
            ? snippet.prefix.slice(0, 10)
            : [snippet.prefix ?? label];
          const body = Array.isArray(snippet.body)
            ? snippet.body.join("\n")
            : snippet.body;
          if (
            typeof body !== "string" ||
            body.length > 10000 ||
            prefixes.some((prefix) => typeof prefix !== "string")
          ) {
            continue;
          }
          for (const prefix of prefixes as string[]) {
            if (existing.length >= 1000) break;
            existing.push({
              label: prefix,
              insertText: body,
              description:
                typeof snippet.description === "string"
                  ? snippet.description
                  : label,
              extensionId: extension.id,
            });
          }
        }
        next[language] = existing;
      }
      snippetsRef.current = next;
    },
    [],
  );

  const themeClass = settings.theme === "dark" ? "theme-dark" : "theme-light";
  const toolbarItems = [
    {
      id: "explorer",
      icon: "▤",
      label: "Explorer",
      action: () => {
        setSidePanel("explorer");
        setGradlePanelOpen(false);
      },
    },
    {
      id: "gradle",
      icon: "◈",
      label: "Gradle",
      action: () => {
        if (!workspaceRoot) return;
        setSidePanel("gradle");
        setGradlePanelOpen(true);
      },
    },
    {
      id: "sourceControl",
      icon: "⌘",
      label: "Git",
      action: () => {
        if (workspaceRoot) setGitPanelOpen(true);
      },
    },
    {
      id: "terminal",
      icon: "›_",
      label: "Terminal",
      action: () => {
        if (!workspaceRoot) return;
        setRightPanel("terminal");
        setIsTerminalOpen(true);
      },
    },
    {
      id: "minecraft",
      icon: "⬡",
      label: "Minecraft",
      action: () => setMinecraftDevOpen(true),
    },
    {
      id: "theme",
      icon: "◐",
      label: "Theme",
      action: () => setCustomizeOpen(true),
    },
    {
      id: "customize",
      icon: "☷",
      label: "Customize",
      action: () => setCustomizeOpen(true),
    },
    {
      id: "addons",
      icon: "◇",
      label: "Add-ons",
      action: () => setAddonManagerOpen(true),
    },
    {
      id: "languageTools",
      icon: "⌁",
      label: "Language",
      action: () => setLanguageToolsOpen(true),
    },
    {
      id: "vsix",
      icon: "▧",
      label: "Extensions",
      action: () => setVsixManagerOpen(true),
    },
    {
      id: "tests",
      icon: "✓",
      label: "Tests",
      action: () => {
        if (workspaceRoot) setTestExplorerOpen(true);
      },
    },
    {
      id: "debug",
      icon: "⌖",
      label: "Debug",
      action: () => {
        if (workspaceRoot) setDebugPanelOpen(true);
      },
    },
    {
      id: "snapshots",
      icon: "◷",
      label: "Snapshots",
      action: () => {
        if (workspaceRoot) setSnapshotsOpen(true);
      },
    },
  ];
  const orderedToolbarItems = toolbarOrder
    .map((id) => toolbarItems.find((item) => item.id === id))
    .filter((item): item is (typeof toolbarItems)[number] => Boolean(item));
  const moveToolbarItem = (targetId: string) => {
    if (!draggedToolbarItem || draggedToolbarItem === targetId) return;
    const next = [...toolbarOrder];
    const fromIndex = next.indexOf(draggedToolbarItem);
    const toIndex = next.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, draggedToolbarItem);
    setToolbarOrder(next);
    void api.settings.set("toolbarOrder", next);
    setDraggedToolbarItem(null);
  };
  const appStyle = {
    "--accent": accentColor,
    "--highlight": `color-mix(in srgb, ${accentColor} 18%, transparent)`,
  } as React.CSSProperties;

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    const first = files[0] as any;
    if (!first?.path) return;

    api.fs
      .stat(first.path)
      .then(async (stat: any) => {
        if (stat?.error) throw new Error(stat.error);
        if (stat?.isDirectory) {
          setWorkspaceRoot(first.path);
        } else {
          await openFile(first.path);
        }
      })
      .catch(reportError);
  };

  const restoreTab = (tabId: string) => {
    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              content: tab.lastSavedContent ?? tab.content,
              isDirty: false,
            }
          : tab,
      ),
    );
  };

  return (
    <div
      className={`app ${themeClass}`}
      style={appStyle}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      <div className="toolbar">
        <div className="toolbar-left">
          <div className="studio-mark" aria-label="Zephra Studio">
            <span className="studio-mark-icon">Z</span>
          </div>
          <details className="menu-dropdown">
            <summary>File</summary>
            <div className="menu-dropdown-items">
              <button onClick={() => void openWorkspace()}>Open Folder…</button>
              <button onClick={requestNewFile} disabled={!workspaceRoot}>
                New File
              </button>
              <button
                onClick={() => void saveActiveTab()}
                disabled={!activeTab}
              >
                Save
              </button>
              <button onClick={() => void saveAllTabs()}>Save All</button>
              <button onClick={() => setZephraLabOpen(true)}>Zephra Lab</button>
            </div>
          </details>
        </div>
        <div className="toolbar-search-slot">
          <CommandPalette
            open={commandPaletteOpen}
            commands={commands}
            onClose={() => setCommandPaletteOpen(false)}
            onOpen={() => setCommandPaletteOpen(true)}
          />
        </div>
        <div className="toolbar-right">
          <div className="toolbar-actions" aria-label="Studio actions">
            {orderedToolbarItems.map((item) => (
              <button
                key={item.id}
                className="toolbar-action"
                title={`${item.label} · Drag to reorder`}
                aria-label={item.label}
                draggable
                onDragStart={() => setDraggedToolbarItem(item.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveToolbarItem(item.id)}
                onDragEnd={() => setDraggedToolbarItem(null)}
                onClick={item.action}
              >
                <span aria-hidden="true">{item.icon}</span>
                <small>{item.label}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      <Split
        className="split"
        sizes={layoutSizes}
        minSize={[230, 420]}
        gutterSize={8}
        direction="horizontal"
        onDragEnd={(sizes: number[]) => {
          setLayoutSizes(sizes);
          void api.settings.set("layoutSizes", sizes);
        }}
      >
        <div className="sidebar">
          <nav className="activity-bar" aria-label="Workspace panels">
            <button
              className={`activity-button ${sidePanel === "explorer" ? "active" : ""}`}
              onClick={() => {
                setSidePanel("explorer");
                setGradlePanelOpen(false);
                void api.settings.set("sidePanel", "explorer");
              }}
              title="Explorer"
              aria-label="Explorer"
            >
              ▤
            </button>
            <button
              className={`activity-button ${sidePanel === "gradle" ? "active" : ""}`}
              onClick={() => {
                if (!workspaceRoot) return;
                setSidePanel("gradle");
                setGradlePanelOpen(true);
                void api.settings.set("sidePanel", "gradle");
              }}
              title="Gradle tasks"
              aria-label="Gradle tasks"
              disabled={!workspaceRoot}
            >
              ◈
            </button>
            <div className="activity-bar-spacer" />
            <button
              className="activity-button"
              onClick={() => setCustomizeOpen(true)}
              title="Customize layout and theme"
              aria-label="Customize layout and theme"
            >
              ⚙
            </button>
          </nav>
          <div className="side-panel-content">
            {sidePanel === "gradle" ? (
              workspaceRoot ? (
                <GradlePanel
                  open={gradlePanelOpen}
                  workspaceRoot={workspaceRoot}
                />
              ) : (
                <div className="welcome-content">
                  <p>Open a project to use Gradle.</p>
                </div>
              )
            ) : workspaceRoot ? (
              <FileExplorer
                rootPath={workspaceRoot}
                activePath={activeTab?.filePath ?? null}
                createFileRequest={newFileRequest}
                onCreateFileRequestHandled={clearNewFileRequest}
                openFile={openFile}
                onCreateFile={async (filePath) => {
                  const result = await api.fs.writeFile(filePath, "");
                  if (result?.error) throw new Error(result.error);
                  await openFile(filePath);
                }}
                onDeleteFile={async (filePath) => {
                  const result = await api.fs.delete(filePath);
                  if (result?.error) throw new Error(result.error);
                  setTabs((previous) => {
                    const remaining = previous.filter(
                      (tab) =>
                        tab.filePath !== filePath &&
                        !tab.filePath.startsWith(`${filePath}/`) &&
                        !tab.filePath.startsWith(`${filePath}\\`),
                    );
                    if (
                      previous.some(
                        (tab) =>
                          tab.id === activeTabId &&
                          !remaining.some((item) => item.id === tab.id),
                      )
                    ) {
                      setActiveTabId(
                        remaining[remaining.length - 1]?.id ?? null,
                      );
                    }
                    return remaining;
                  });
                }}
                onRenameFile={async (oldPath, newPath) => {
                  const result = await api.fs.rename(oldPath, newPath);
                  if (result?.error) throw new Error(result.error);
                  setTabs((prev) =>
                    prev.map((tab) =>
                      tab.filePath === oldPath
                        ? {
                            ...tab,
                            filePath: newPath,
                            language: detectLanguageFromPath(newPath),
                          }
                        : tab,
                    ),
                  );
                }}
              />
            ) : (
              <div className="welcome">
                <div className="welcome-content">
                  <h2>Welcome to Zephra Studio</h2>
                  <p>Open a folder to get started.</p>
                  <button className="primary" onClick={openWorkspace}>
                    Open Folder
                  </button>
                  {recentProjects.length > 0 && (
                    <div className="recent">
                      <h4>Recent Projects</h4>
                      <ul>
                        {recentProjects.map((path) => (
                          <li key={path}>
                            <button
                              className="link"
                              onClick={() => setWorkspaceRoot(path)}
                            >
                              {path}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="main-area">
          <Split
            className="right-dock-split"
            sizes={rightLayoutSizes}
            minSize={[360, 230]}
            gutterSize={8}
            direction="horizontal"
            onDragEnd={(sizes: number[]) => {
              setRightLayoutSizes(sizes);
              void api.settings.set("rightLayoutSizes", sizes);
            }}
          >
            <div className="editor-pane">
              <div className="tab-bar">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`tab ${tab.id === activeTabId ? "active" : ""}`}
                  >
                    <button
                      className="tab-label-button"
                      onClick={() => setActiveTabId(tab.id)}
                      title={
                        tab.isDirty ? "Unsaved recovered changes" : tab.filePath
                      }
                    >
                      {getBaseName(tab.filePath)}
                      {tab.isDirty ? "*" : ""}
                    </button>
                    <button
                      className="tab-close"
                      onClick={() => closeTab(tab.id)}
                      title={`Close ${getBaseName(tab.filePath)}`}
                      aria-label={`Close ${getBaseName(tab.filePath)}`}
                    >
                      ×
                    </button>
                    {tab.isDirty && (
                      <button
                        className="tab-recovery-discard"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Discard recovered changes to ${getBaseName(tab.filePath)} and reload the saved file?`,
                            )
                          ) {
                            restoreTab(tab.id);
                          }
                        }}
                        title="Discard recovered changes and reload the saved file"
                        aria-label={`Discard recovered changes to ${getBaseName(tab.filePath)}`}
                      >
                        ↶
                      </button>
                    )}
                  </div>
                ))}
                <div className="tab-spacer" />
                <button
                  className="tab-action"
                  onClick={() => setCommandPaletteOpen(true)}
                >
                  ···
                </button>
              </div>
              <div className="editor-container">
                {activeTab ? (
                  <Editor
                    height="100%"
                    path={activeFileUri ?? undefined}
                    language={activeLanguage}
                    theme={
                      customMonacoTheme ??
                      (settings.theme === "dark" ? "vs-dark" : "light")
                    }
                    value={activeTab.content}
                    onChange={(value) => handleEditorChange(value ?? "")}
                    options={{
                      minimap: { enabled: true },
                      wordWrap: "on",
                      tabSize: 2,
                      fontFamily:
                        settings.theme === "dark"
                          ? "Menlo, Monaco, 'Courier New', monospace"
                          : undefined,
                      automaticLayout: true,
                    }}
                    beforeMount={(monaco) => {
                      monacoRef.current = monaco;
                      registerZephraLanguage(monaco);
                      registerLanguageServerProviders(monaco);
                    }}
                    onMount={(editor, monaco) => {
                      editorRef.current = editor;
                      monacoRef.current = monaco;
                    }}
                  />
                ) : (
                  <div className="no-file">
                    <h2>No file open</h2>
                    <p>Open a file from the Explorer to start editing.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="right-dock">
              <div className="right-dock-tabs">
                <button
                  className={rightPanel === "output" ? "active" : ""}
                  onClick={() => {
                    setRightPanel("output");
                    setIsTerminalOpen(false);
                    setIsOutputOpen(true);
                    void api.settings.set("rightPanel", "output");
                  }}
                >
                  Output
                </button>
                <button
                  className={rightPanel === "terminal" ? "active" : ""}
                  onClick={() => {
                    setRightPanel("terminal");
                    setIsTerminalOpen(true);
                    void api.settings.set("rightPanel", "terminal");
                  }}
                  disabled={!workspaceRoot}
                >
                  Terminal
                </button>
                <button
                  className="right-dock-close"
                  title="Hide this panel"
                  onClick={() => {
                    if (rightPanel === "terminal") setIsTerminalOpen(false);
                    else setIsOutputOpen(false);
                  }}
                >
                  ×
                </button>
              </div>
              {rightPanel === "terminal" && isTerminalOpen && workspaceRoot ? (
                <TerminalPanel
                  open={true}
                  cwd={workspaceRoot}
                  onClose={() => setIsTerminalOpen(false)}
                />
              ) : rightPanel === "output" && isOutputOpen ? (
                <OutputPanel
                  open={true}
                  outputs={runOutput}
                  onClear={() => setRunOutput([])}
                  onClose={() => setIsOutputOpen(false)}
                />
              ) : (
                <div className="right-dock-empty">
                  <span>Panel hidden</span>
                  <button
                    onClick={() => {
                      if (rightPanel === "terminal") setIsTerminalOpen(true);
                      else setIsOutputOpen(true);
                    }}
                  >
                    Show {rightPanel === "terminal" ? "Terminal" : "Output"}
                  </button>
                </div>
              )}
            </div>
          </Split>
        </div>
      </Split>

      <StatusBar
        filePath={activeTab?.filePath}
        language={activeLanguage}
        isDirty={activeTab?.isDirty ?? false}
        theme={settings.theme}
        gitBranch={gitBranch}
        gitDirty={gitDirty}
      />

      {customizeOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCustomizeOpen(false);
          }}
        >
          <section
            className="customize-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customize-title"
          >
            <header className="customize-header">
              <div>
                <span className="eyebrow">PERSONALIZE</span>
                <h2 id="customize-title">Studio appearance & layout</h2>
              </div>
              <button
                className="dialog-close"
                onClick={() => setCustomizeOpen(false)}
                aria-label="Close customization"
              >
                ×
              </button>
            </header>
            <div className="customize-section">
              <h3>Theme</h3>
              <div className="theme-choice-row">
                {(["dark", "light"] as const).map((theme) => (
                  <button
                    key={theme}
                    className={`theme-choice theme-choice-${theme} ${settings.theme === theme ? "selected" : ""}`}
                    onClick={() => {
                      setSettings((previous) => ({ ...previous, theme }));
                      setCustomMonacoTheme(null);
                      void api.settings.set("theme", theme);
                    }}
                  >
                    <span className="theme-preview" />
                    <span>{theme === "dark" ? "Midnight" : "Daylight"}</span>
                    <small>
                      {settings.theme === theme ? "Active" : "Select"}
                    </small>
                  </button>
                ))}
              </div>
              <label className="accent-setting">
                <span>
                  <strong>Accent color</strong>
                  <small>Updates highlights and selection colors.</small>
                </span>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(event) => {
                    setAccentColor(event.target.value);
                    void api.settings.set("accentColor", event.target.value);
                  }}
                  aria-label="Choose accent color"
                />
              </label>
            </div>
            <div className="customize-section">
              <h3>Resizable panels</h3>
              <p>
                Drag the dividers between Explorer, Editor, and the right dock.
                Your panel sizes are saved automatically.
              </p>
              <div className="panel-choice-row">
                <button
                  className={sidePanel === "explorer" ? "selected" : ""}
                  onClick={() => {
                    setSidePanel("explorer");
                    setGradlePanelOpen(false);
                    void api.settings.set("sidePanel", "explorer");
                  }}
                >
                  Left: Explorer
                </button>
                <button
                  className={sidePanel === "gradle" ? "selected" : ""}
                  disabled={!workspaceRoot}
                  onClick={() => {
                    setSidePanel("gradle");
                    setGradlePanelOpen(true);
                    void api.settings.set("sidePanel", "gradle");
                  }}
                >
                  Left: Gradle
                </button>
                <button
                  className={rightPanel === "output" ? "selected" : ""}
                  onClick={() => {
                    setRightPanel("output");
                    setIsOutputOpen(true);
                    setIsTerminalOpen(false);
                    void api.settings.set("rightPanel", "output");
                  }}
                >
                  Right: Output
                </button>
                <button
                  className={rightPanel === "terminal" ? "selected" : ""}
                  disabled={!workspaceRoot}
                  onClick={() => {
                    setRightPanel("terminal");
                    setIsTerminalOpen(true);
                    void api.settings.set("rightPanel", "terminal");
                  }}
                >
                  Right: Terminal
                </button>
              </div>
            </div>
            <div className="customize-section customize-toolbar-help">
              <h3>Toolbar placement</h3>
              <p>
                Drag the toolbar icons left or right to rearrange them. Use the
                File menu for new files and save actions. Press Ctrl+Shift+P to
                search commands.
              </p>
            </div>
          </section>
        </div>
      )}
      <SearchPanel
        open={searchOpen}
        rootPath={workspaceRoot}
        onClose={() => setSearchOpen(false)}
        onSelectResult={navigateToSearchResult}
      />
      <ZephraLab
        open={zephraLabOpen}
        rootPath={workspaceRoot}
        onClose={() => setZephraLabOpen(false)}
      />
      <AddonManager
        open={addonManagerOpen}
        onClose={() => setAddonManagerOpen(false)}
        onCommandsLoaded={registerAddonCommands}
        onRunAddon={runAddon}
      />
      <VSCodeExtensionManager
        open={vsixManagerOpen}
        onClose={() => setVsixManagerOpen(false)}
        onApplyTheme={applyVsCodeTheme}
        onInstallSnippets={installVsCodeSnippets}
      />
      <MinecraftDev
        open={minecraftDevOpen}
        onClose={() => setMinecraftDevOpen(false)}
        onOpenProject={(path) => {
          setWorkspaceRoot(path);
          setMinecraftDevOpen(false);
        }}
      />
      <LanguageTools
        open={languageToolsOpen}
        onClose={() => setLanguageToolsOpen(false)}
        onSettingsChanged={() =>
          setLanguageToolsRevision((revision) => revision + 1)
        }
      />
      {workspaceRoot && (
        <GitPanel
          open={gitPanelOpen}
          rootPath={workspaceRoot}
          onClose={() => setGitPanelOpen(false)}
          onStatusChanged={(status) => {
            setGitBranch(status.branch);
            setGitDirty(status.dirty);
          }}
        />
      )}
      {workspaceRoot && (
        <WorkspaceSnapshots
          open={snapshotsOpen}
          rootPath={workspaceRoot}
          tabs={tabs}
          activeTabId={activeTabId}
          onClose={() => setSnapshotsOpen(false)}
          onRestore={restoreWorkspaceSnapshot}
        />
      )}
      {workspaceRoot && (
        <TestExplorer
          open={testExplorerOpen}
          rootPath={workspaceRoot}
          onClose={() => setTestExplorerOpen(false)}
        />
      )}
      {workspaceRoot && (
        <DebugPanel
          open={debugPanelOpen}
          rootPath={workspaceRoot}
          activeFilePath={activeTab?.filePath ?? null}
          onClose={() => setDebugPanelOpen(false)}
        />
      )}
    </div>
  );
}
