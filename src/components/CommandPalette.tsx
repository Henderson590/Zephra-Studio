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
  onOpen: () => void;
};

export default function CommandPalette({
  open,
  commands,
  onClose,
  onOpen,
}: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    return commands
      .filter((cmd) => cmd.label.toLowerCase().includes(lower))
      .slice(0, 12);
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "Enter" && filtered.length > 0) {
        event.preventDefault();
        filtered[0].action();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose]);

  return (
    <div className="command-palette" ref={rootRef}>
      <div className="command-search-wrap">
        <span className="command-search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Search commands…"
          value={query}
          onFocus={onOpen}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search commands"
          aria-expanded={open}
        />
        <kbd>Ctrl ⇧ P</kbd>
      </div>
      {open && (
        <div className="command-palette-list">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              className="command-palette-item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                cmd.action();
                onClose();
              }}
            >
              {cmd.label}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="command-palette-empty">No commands match.</div>
          )}
        </div>
      )}
    </div>
  );
}
