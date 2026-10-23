import React, { useMemo, useState, useEffect, useRef } from "react";
import "../styles.css";

export type Command = {
  id: string;
  label: string;
  action: () => void;
};

type Props = {
  open: boolean;
  commands: Command[];
  onClose: () => void;
};

export default function CommandPalette({ open, commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    return commands
      .filter((cmd) => cmd.label.toLowerCase().includes(lower))
      .slice(0, 12);
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="command-palette-list">
          {filtered.map((cmd) => (
            <div
              key={cmd.id}
              className="command-palette-item"
              onClick={() => {
                cmd.action();
                onClose();
              }}
            >
              {cmd.label}
            </div>
          ))}
          {filtered.length === 0 && <div className="command-palette-empty">No commands match.</div>}
        </div>
      </div>
    </div>
  );
}
