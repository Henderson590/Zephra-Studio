import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "../api/ipc";
import "../styles.css";

type TerminalOutput = {
  id: string;
  type: "stdout" | "stderr" | "exit";
  data?: string;
  code?: number;
};

type Props = {
  open: boolean;
  cwd: string;
  onClose: () => void;
};

export default function TerminalPanel({ open, cwd, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [processId, setProcessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!open || !host) return;

    let cancelled = false;
    let ptyId: string | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const hostStyles = window.getComputedStyle(host);
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: 13,
      theme: {
        background: hostStyles.backgroundColor,
        foreground: hostStyles.color,
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    fit.fit();

    const resize = () => {
      if (!ptyId || terminal.cols < 20 || terminal.rows < 5) return;
      void api.terminal
        .resize(ptyId, { cols: terminal.cols, rows: terminal.rows })
        .then((result: { success?: true; error?: string }) => {
          if (result?.error) setError(result.error);
        })
        .catch((resizeError: unknown) => setError(String(resizeError)));
    };
    resizeObserver = new ResizeObserver(() => {
      fit.fit();
      resize();
    });
    resizeObserver.observe(host);

    const unsubscribe = api.on("terminal.output", (output: TerminalOutput) => {
      if (output.id !== ptyId) return;
      if (output.type === "exit") {
        terminal.write(`\r\n[Shell exited with code ${output.code ?? 1}]\r\n`);
        ptyId = null;
        setProcessId(null);
      } else if (output.data) {
        terminal.write(output.data);
      }
    });

    void api.terminal
      .start(cwd, { cols: terminal.cols, rows: terminal.rows })
      .then((result: { id: string } | { error: string }) => {
        if ("error" in result) throw new Error(result.error);
        if (cancelled) {
          void api.terminal.stop(result.id);
          return;
        }
        ptyId = result.id;
        setProcessId(result.id);
        resize();
        terminal.focus();
      })
      .catch((startError: unknown) => {
        if (!cancelled) setError(String(startError));
      });

    const input = terminal.onData((data) => {
      if (!ptyId) return;
      void api.terminal
        .write(ptyId, data)
        .then((result: { success?: true; error?: string }) => {
          if (result?.error) setError(result.error);
        })
        .catch((writeError: unknown) => setError(String(writeError)));
    });

    return () => {
      cancelled = true;
      unsubscribe();
      input.dispose();
      resizeObserver?.disconnect();
      if (ptyId) void api.terminal.stop(ptyId);
      terminal.dispose();
      setProcessId(null);
    };
  }, [cwd, open]);

  if (!open) return null;

  const stop = async () => {
    if (!processId) return;
    const result = await api.terminal.stop(processId);
    if (result?.error) setError(result.error);
  };

  return (
    <section className="terminal-panel" aria-label="Workspace terminal">
      <div className="output-toolbar">
        <span>Terminal · PTY</span>
        <div className="output-actions">
          <button onClick={() => void stop()} disabled={!processId}>
            Stop
          </button>
          <button onClick={onClose}>Hide</button>
        </div>
      </div>
      <div className="terminal-cwd">{cwd}</div>
      {error && <div className="explorer-error">{error}</div>}
      <div className="xterm-host" ref={hostRef} />
    </section>
  );
}
