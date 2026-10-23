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
