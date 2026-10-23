import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/ipc";
import "../styles.css";

export type SearchResult = {
  path: string;
  line: number;
  text: string;
};

type Props = {
  open: boolean;
  rootPath: string | null;
  onClose: () => void;
  onSelectResult: (path: string, line: number) => void;
};

export default function SearchPanel({ open, rootPath, onClose, onSelectResult }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
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

  const runSearch = async () => {
    if (!rootPath || !query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const res = await api.search.query({ root: rootPath, query });
    setResults(Array.isArray(res) ? res : []);
    setLoading(false);
  };

  const debouncedSearch = useMemo(() => {
    let handle: ReturnType<typeof setTimeout>;
    return (value: string) => {
      if (handle) clearTimeout(handle);
      handle = setTimeout(() => runSearch(), 400);
    };
  }, [query, rootPath]);

  useEffect(() => {
    if (!open) return;
    debouncedSearch(query);
  }, [query, debouncedSearch, open]);

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Search in workspace..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="command-palette-list">
          {loading && <div className="command-palette-empty">Searching...</div>}
          {!loading && results.length === 0 && query.trim().length > 0 && (
            <div className="command-palette-empty">No matches found.</div>
          )}
          {results.map((result, idx) => (
            <div
              key={`${result.path}-${result.line}-${idx}`}
              className="command-palette-item"
              onClick={() => {
                onSelectResult(result.path, result.line);
                onClose();
              }}
            >
              <div className="command-palette-item-title">{result.path}</div>
              <div className="command-palette-item-subtitle">
                {result.line}: {result.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
