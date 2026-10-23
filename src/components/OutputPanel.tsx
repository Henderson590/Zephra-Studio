import React, { useEffect, useRef } from "react";
import { RunOutput } from "../types";
import "../styles.css";

type Props = {
  open: boolean;
  outputs: RunOutput[];
  onClear: () => void;
  onClose: () => void;
};

export default function OutputPanel({ open, outputs, onClear, onClose }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [outputs, open]);

  if (!open) return null;

  return (
    <div className="output-panel">
      <div className="output-toolbar">
        <span>Output</span>
        <div className="output-actions">
          <button onClick={onClear}>Clear</button>
          <button onClick={onClose}>Hide</button>
        </div>
      </div>
      <div className="output-body" ref={scrollRef}>
        {outputs.map((output, idx) => {
          const className = output.type === "stderr" ? "output-stderr" : output.type === "exit" ? "output-meta" : "output-stdout";
          const text = output.data || (output.type === "exit" ? `Process exited with code ${output.code}` : "");
          return (
            <div key={`${output.id}-${idx}`} className={`output-line ${className}`}>
              <pre>{text}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
