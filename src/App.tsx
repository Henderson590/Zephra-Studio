import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@monaco-editor/react";
import Split from "react-split";
import { api } from "./api/ipc";
import { detectLanguageFromPath, registerZephraLanguage } from "./lib/zephraLanguage";
import { FileTab, RunOutput, StudioAddonCommand } from "./types";
import CommandPalette, { Command } from "./components/CommandPalette";
import SearchPanel from "./components/SearchPanel";
import ZephraLab from "./components/ZephraLab";
import AddonManager from "./components/AddonManager";
import FileExplorer from "./components/FileExplorer";
import StatusBar from "./components/StatusBar";
import OutputPanel from "./components/OutputPanel";

import "./styles.css";

function makeNewTab(filePath: string, content: string): FileTab {
  return {
    id: `${filePath}-${Date.now()}`,
    filePath,
    content,
    lastSavedContent: content,
    isDirty: false,
    language: detectLanguageFromPath(filePath)
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
  const [settings, setSettings] = useState<{ theme: "light" | "dark"; autoSave: boolean }>({
    theme: "dark",
    autoSave: true
  });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [zephraLabOpen, setZephraLabOpen] = useState(false);
  const [addonManagerOpen, setAddonManagerOpen] = useState(false);
  const [addonCommands, setAddonCommands] = useState<Array<StudioAddonCommand & { addonName: string }>>([]);
  const [recentProjects, setRecentProjects] = useState<string[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [gitDirty, setGitDirty] = useState(false);
  const editorRef = useRef<any>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId]);

  const reportError = useCallback((error: unknown) => {
    setIsOutputOpen(true);
    setRunOutput((previous) => [
      ...previous,
      { id: `error-${Date.now()}`, type: "stderr", data: `${String(error)}\n` }
    ]);
  }, []);

  useEffect(() => {
    const monaco = (window as any).monaco;
    if (monaco && monaco.languages) {
      registerZephraLanguage(monaco);
    }
  }, []);

  useEffect(() => {
    api.settings.get("theme").then((value: any) => {
      if (value === "light" || value === "dark") {
        setSettings((prev) => ({ ...prev, theme: value }));
      }
    });
    api.settings.get("autoSave").then((value: any) => {
      if (typeof value === "boolean") {
        setSettings((prev) => ({ ...prev, autoSave: value }));
      }
    });
    api.project.getRecents().then((recents: any) => {
      if (Array.isArray(recents)) setRecentProjects(recents);
    });
  }, []);

  useEffect(() => {
    const cleanup = api.on("run.output", (output: RunOutput) => {
      setRunOutput((prev) => [...prev, output]);

      if (output.type === "exit" && output.diagnostics && output.diagnostics.length && editorRef.current) {
        const monaco = (window as any).monaco;
        const model = editorRef.current.getModel();
        if (model && monaco?.editor) {
          const markers = (output.diagnostics || []).map((diag) => ({
            startLineNumber: diag.line + 1,
            startColumn: diag.column + 1,
            endLineNumber: diag.line + 1,
            endColumn: diag.column + 1,
            message: diag.message,
            severity: monaco.MarkerSeverity.Error
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
    api.git.status(workspaceRoot).then((status: any) => {
      if (status) {
        setGitBranch(status.branch);
        setGitDirty(Boolean(status.dirty));
      }
    }).catch(reportError);

    const cleanup = api.on("fs.watcher:event", (event: any) => {
      if (activeTab && event.path === activeTab.filePath) {
        // reload file if changed externally
        api.fs.readFile(activeTab.filePath).then((result: any) => {
          if (result?.error) throw new Error(result.error);
          if (result?.data !== undefined && result.data !== activeTab.content && !activeTab.isDirty) {
            setTabs((prev) =>
              prev.map((t) =>
                t.id === activeTab.id ? { ...t, content: result.data, lastSavedContent: result.data, isDirty: false } : t
              )
            );
          }
        }).catch(reportError);
      }
    });
    return () => {
      cleanup();
      api.fs.unwatch(workspaceRoot).catch(reportError);
    };
  }, [workspaceRoot, activeTab, reportError]);

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
    [tabs]
  );

  const saveTab = useCallback(
    async (tab: FileTab) => {
      const result = await api.fs.writeFile(tab.filePath, tab.content);
      if (result?.error) throw new Error(result.error);
      setTabs((prev) =>
        prev.map((t) => (t.id === tab.id ? { ...t, lastSavedContent: tab.content, isDirty: false } : t))
      );

      const monaco = (window as any).monaco;
      if (editorRef.current && monaco?.editor) {
        const model = editorRef.current.getModel();
        if (model) {
          monaco.editor.setModelMarkers(model, "zephra", []);
        }
      }
    },
    []
  );

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
      await Promise.all(tabs.map((t) => (t.isDirty ? saveTab(t) : Promise.resolve())));
    } catch (error) {
      reportError(error);
    }
  }, [reportError, saveTab, tabs]);

  const closeTab = useCallback(
    (tabId: string) => {
      const closingTab = tabs.find((tab) => tab.id === tabId);
      if (closingTab?.isDirty && !window.confirm(`Discard unsaved changes to ${getBaseName(closingTab.filePath)}?`)) {
        return;
      }
      const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
      setTabs((prev) => prev.filter((tab) => tab.id !== tabId));
      if (activeTabId === tabId) {
        const remaining = tabs.filter((tab) => tab.id !== tabId);
        setActiveTabId(remaining[Math.max(0, closingIndex - 1)]?.id ?? null);
      }
    },
    [activeTabId, tabs]
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
                isDirty: value !== tab.lastSavedContent
              }
            : tab
        )
      );

      if (settings.autoSave) {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
          saveTab({ ...activeTab, content: value, isDirty: value !== activeTab.lastSavedContent }).catch(reportError);
        }, 750);
      }
    },
    [activeTab, reportError, saveTab, settings.autoSave]
  );

  const runCurrentFile = useCallback(async () => {
    if (!activeTab) return;
    const language = detectLanguageFromPath(activeTab.filePath);
    setIsOutputOpen(true);
    setRunOutput((prev) => [
      ...prev,
      { id: "__meta__", type: "stdout", data: `Running ${activeTab.filePath}...\n` }
    ]);
    try {
      await saveTab(activeTab);
      await api.runner.run({ path: activeTab.filePath, language });
    } catch (error) {
      reportError(error);
    }
  }, [activeTab, reportError, saveTab]);

  const runAddon = useCallback(async (addonPath: string) => {
    setIsOutputOpen(true);
    setRunOutput((prev) => [
      ...prev,
      { id: `addon-${Date.now()}`, type: "stdout", data: `Running add-on ${addonPath}...\n` }
    ]);
    try {
      await api.runner.run({ path: addonPath, language: "zephra" });
    } catch (error) {
      reportError(error);
    }
  }, [reportError]);

  const registerAddonCommands = useCallback((addonName: string, registered: StudioAddonCommand[]) => {
    const commands = registered.map((command) => ({
      ...command,
      id: `addon:${addonName}:${command.id}`,
      addonName
    }));
    setAddonCommands((previous) => [
      ...previous.filter((command) => command.addonName !== addonName),
      ...commands
    ]);
  }, []);

  const executeAddonCommand = useCallback(
    (command: StudioAddonCommand) => {
      if (command.action === "notify") {
        setIsOutputOpen(true);
        setRunOutput((previous) => [
          ...previous,
          { id: `addon-command-${Date.now()}`, type: "stdout", data: `${command.value}\n` }
        ]);
        return;
      }
      if (command.action === "insert_text") {
        const editor = editorRef.current;
        const selection = editor?.getSelection();
        if (!editor || !selection) return;
        editor.executeEdits("zephra-addon", [
          { range: selection, text: command.value, forceMoveMarkers: true }
        ]);
        editor.focus();
        return;
      }
      void runCurrentFile();
    },
    [runCurrentFile]
  );

  const navigateToSearchResult = useCallback(
    async (path: string, line: number) => {
      try {
        const tab = await openFile(path);
        if (!tab) return;
        setTimeout(() => {
          if (editorRef.current && typeof editorRef.current.revealLineInCenter === "function") {
            editorRef.current.revealLineInCenter(line);
          }
        }, 150);
      } catch (error) {
        reportError(error);
      }
    },
    [openFile, reportError]
  );

  const commands: Command[] = useMemo(() => {
    const cmd: Command[] = [
      {
        id: "openWorkspace",
        label: "Open Folder...",
        action: openWorkspace
      },
      {
        id: "save",
        label: "Save File",
        action: saveActiveTab
      },
      {
        id: "saveAll",
        label: "Save All",
        action: saveAllTabs
      },
      {
        id: "run",
        label: "Run Current File",
        action: runCurrentFile
      },
      {
        id: "toggleOutput",
        label: "Toggle Output Panel",
        action: () => setIsOutputOpen((v) => !v)
      },
      {
        id: "toggleTheme",
        label: settings.theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme",
        action: () => {
          const nextTheme = settings.theme === "dark" ? "light" : "dark";
          setSettings((prev) => ({ ...prev, theme: nextTheme }));
          api.settings.set("theme", nextTheme);
        }
      },
      {
        id: "addons",
        label: "Manage Add-ons",
        action: () => setAddonManagerOpen(true)
      }
    ];
    return [
      ...cmd,
      ...addonCommands.map((addonCommand) => ({
        id: addonCommand.id,
        label: `${addonCommand.addonName}: ${addonCommand.label}`,
        action: () => executeAddonCommand(addonCommand)
      }))
    ];
  }, [openWorkspace, saveActiveTab, saveAllTabs, runCurrentFile, settings.theme, addonCommands, executeAddonCommand]);

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

  const activeLanguage = activeTab ? detectLanguageFromPath(activeTab.filePath) : "plaintext";

  const themeClass = settings.theme === "dark" ? "theme-dark" : "theme-light";

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    const first = files[0] as any;
    if (!first?.path) return;

    api.fs.stat(first.path).then(async (stat: any) => {
      if (stat?.error) throw new Error(stat.error);
      if (stat?.isDirectory) {
        setWorkspaceRoot(first.path);
      } else {
        await openFile(first.path);
      }
    }).catch(reportError);
  };

  return (
    <div className={`app ${themeClass}`} onDrop={onDrop} onDragOver={onDragOver}>
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="toolbar-button" onClick={openWorkspace}>
            Open Folder
          </button>
          <button className="toolbar-button" onClick={saveActiveTab} disabled={!activeTab}>
            Save
          </button>
          <button className="toolbar-button" onClick={runCurrentFile} disabled={!activeTab}>
            Run
          </button>
          <button className="toolbar-button" onClick={() => setZephraLabOpen(true)}>
            Zephra Lab
          </button>
          <button className="toolbar-button" onClick={() => setAddonManagerOpen(true)}>
            Add-ons
          </button>
        </div>
        <div className="toolbar-right">
          <button className="toolbar-button" onClick={() => setCommandPaletteOpen(true)}>
            Command Palette (Ctrl+Shift+P)
          </button>
        </div>
      </div>

      <Split className="split" sizes={[25, 75]} minSize={[240, 320]} gutterSize={8} direction="horizontal">
        <div className="sidebar">
          <div className="sidebar-header">
            <h3>Explorer</h3>
          </div>
          {workspaceRoot ? (
            <FileExplorer
              rootPath={workspaceRoot}
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
                      !tab.filePath.startsWith(`${filePath}\\`)
                  );
                  if (previous.some((tab) => tab.id === activeTabId && !remaining.some((item) => item.id === tab.id))) {
                    setActiveTabId(remaining[remaining.length - 1]?.id ?? null);
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
                      ? { ...tab, filePath: newPath, language: detectLanguageFromPath(newPath) }
                      : tab
                  )
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
                            onClick={() => {
                              setWorkspaceRoot(path);
                            }}
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

        <div className="main-area">
          <div className="editor-pane">
            <div className="tab-bar">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`tab ${tab.id === activeTabId ? "active" : ""}`}
                >
                  <button className="tab-label-button" onClick={() => setActiveTabId(tab.id)}>
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
                </div>
              ))}
              <div className="tab-spacer" />
              <button className="tab-action" onClick={() => setCommandPaletteOpen(true)}>
                ···
              </button>
            </div>
            <div className="editor-container">
              {activeTab ? (
                <Editor
                  height="100%"
                  language={activeLanguage}
                  theme={settings.theme === "dark" ? "vs-dark" : "light"}
                  value={activeTab.content}
                  onChange={(value) => handleEditorChange(value ?? "")}
                  options={{
                    minimap: { enabled: true },
                    wordWrap: "on",
                    tabSize: 2,
                    fontFamily: settings.theme === "dark" ? "Menlo, Monaco, 'Courier New', monospace" : undefined,
                    automaticLayout: true
                  }}
                  beforeMount={(monaco) => {
                    registerZephraLanguage(monaco);
                  }}
                  onMount={(editor) => {
                    editorRef.current = editor;
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

          {isOutputOpen && (
            <div className="output-wrapper">
              <OutputPanel
                open={true}
                outputs={runOutput}
                onClear={() => setRunOutput([])}
                onClose={() => setIsOutputOpen(false)}
              />
            </div>
          )}
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

      <CommandPalette
        open={commandPaletteOpen}
        commands={commands}
        onClose={() => setCommandPaletteOpen(false)}
      />
      <SearchPanel
        open={searchOpen}
        rootPath={workspaceRoot}
        onClose={() => setSearchOpen(false)}
        onSelectResult={navigateToSearchResult}
      />
      <ZephraLab open={zephraLabOpen} rootPath={workspaceRoot} onClose={() => setZephraLabOpen(false)} />
      <AddonManager
        open={addonManagerOpen}
        onClose={() => setAddonManagerOpen(false)}
        onCommandsLoaded={registerAddonCommands}
        onRunAddon={runAddon}
      />
    </div>
  );
}
