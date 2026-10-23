import React from "react";
import "../styles.css";

type Props = {
  filePath?: string;
  language?: string;
  isDirty?: boolean;
  theme: "light" | "dark";
  gitBranch?: string | null;
  gitDirty?: boolean;
};

export default function StatusBar({ filePath, language, isDirty, theme, gitBranch, gitDirty }: Props) {
  const languageLabel = language === "zephra" ? "Zephra Code" : language || "plaintext";

  return (
    <div className={`status-bar ${theme}`}>
      <div className="status-left">
        <span className="status-item">
          {filePath ? filePath : "No file"} {isDirty ? "*" : ""}
        </span>
      </div>
      <div className="status-right">
        {gitBranch && (
          <span className="status-item">
            Git: {gitBranch} {gitDirty ? "(dirty)" : ""}
          </span>
        )}
        <span className="status-item">Language: {languageLabel}</span>
        <span className="status-item">Theme: {theme}</span>
      </div>
    </div>
  );
}
