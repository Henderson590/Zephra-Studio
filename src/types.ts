export type WorkspaceState = {
  rootPath: string | null;
  openFiles: FileTab[];
  activeTabId: string | null;
  theme: "light" | "dark";
  autoSave: boolean;
  recentProjects: string[];
};

export type FileTab = {
  id: string;
  filePath: string;
  language: string;
  content: string;
  isDirty: boolean;
  lastSavedContent?: string;
};

export type WorkspaceSession = {
  rootPath: string | null;
  tabs: FileTab[];
  activeTabId: string | null;
  isOutputOpen: boolean;
};

export type WorkspaceSnapshot = {
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
};

export type RunOutput = {
  id: string;
  type: "stdout" | "stderr" | "exit";
  data?: string;
  code?: number;
  diagnostics?: Array<{ message: string; line: number; column: number }>;
};

export type StudioAddon = {
  id: string;
  name: string;
  path: string;
  installed: boolean;
};

export type StudioAddonCommand = {
  id: string;
  label: string;
  action: "notify" | "insert_text" | "run_current_file";
  value: string;
};

export type LanguageTool = {
  id: string;
  language: string;
  role: string;
  command: string;
  hint: string;
  configuredPath: string;
  resolvedPath: string | null;
  available: boolean;
};

export type MinecraftPackValidation = {
  root: string;
  type: "resource-pack" | "data-pack" | null;
  minecraftVersion: string | null;
  fileCount: number;
  valid: boolean;
  errors: string[];
  warnings: string[];
};
