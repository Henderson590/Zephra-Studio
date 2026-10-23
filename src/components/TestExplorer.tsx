import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api/ipc";
import "../styles.css";

type TestTarget = {
  id: string;
  label: string;
  runner: "npm" | "python" | "gradle";
};

type TestOutput = {
  id: string;
  type: "stdout" | "stderr" | "exit";
  data?: string | number;
};

type Props = {
  open: boolean;
  rootPath: string;
  onClose: () => void;
};

export default function TestExplorer({ open, rootPath, onClose }: Props) {
  const [targets, setTargets] = useState<TestTarget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result: unknown = await api.tests.discover(rootPath);
      if (
        result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
      ) {
        throw new Error(result.error);
      }
      if (!Array.isArray(result)) {
        throw new Error("Test discovery returned an invalid response.");
      }
      setTargets(result as TestTarget[]);
      setSelectedId((current) =>
        current && result.some((target: TestTarget) => target.id === current)
          ? current
          : (result[0]?.id ?? null),
      );
    } catch (discoveryError) {
      setError(String(discoveryError));
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useEffect(
    () =>
      api.on("tests.output", (event: TestOutput) => {
        if (event.id !== activeRunId) return;
        if (event.type === "exit") {
          setOutput(
            (current) =>
              `${current}\nProcess exited with code ${event.data}.\n`,
          );
          setActiveRunId(null);
          return;
        }
        setOutput((current) =>
          `${current}${String(event.data ?? "")}`.slice(-200_000),
        );
      }),
    [activeRunId],
  );

  const run = async () => {
    if (!selectedId || activeRunId) return;
    setError(null);
    setOutput("");
    try {
      const result = await api.tests.run(rootPath, selectedId);
      if (!result || "error" in result) {
        throw new Error(result?.error || "Could not start the test process.");
      }
      setActiveRunId(result.id);
    } catch (runError) {
      setError(String(runError));
    }
  };

  const stop = async () => {
    if (!activeRunId) return;
    const result = await api.tests.stop(activeRunId);
    if (result?.error) setError(result.error);
    else setActiveRunId(null);
  };

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <section
        className="command-palette test-explorer-panel"
        onClick={(event) => event.stopPropagation()}
        aria-labelledby="test-explorer-title"
      >
        <header className="addon-manager-header">
          <div>
            <h2 id="test-explorer-title">Test Explorer</h2>
            <p>Detected workspace test suites and package test scripts.</p>
          </div>
          <button
            className="addon-manager-close"
            onClick={onClose}
            aria-label="Close test explorer"
          >
            ×
          </button>
        </header>
        <div className="test-explorer-controls">
          <select
            aria-label="Test target"
            value={selectedId ?? ""}
            onChange={(event) => setSelectedId(event.target.value || null)}
            disabled={loading || targets.length === 0 || !!activeRunId}
          >
            {targets.length === 0 && <option value="">No test targets</option>}
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => void refresh()}
            disabled={loading || !!activeRunId}
          >
            Refresh
          </button>
          {activeRunId ? (
            <button onClick={() => void stop()}>Stop</button>
          ) : (
            <button onClick={() => void run()} disabled={!selectedId}>
              Run Tests
            </button>
          )}
        </div>
        {error && <p className="addon-manager-message error">{error}</p>}
        <pre className="test-explorer-output" aria-live="polite">
          {loading && targets.length === 0
            ? "Discovering workspace test targets..."
            : output ||
              (targets.length
                ? "Select a target and run its tests."
                : "No supported tests detected. Supports npm test scripts, Python unittest directories, and Gradle test projects.")}
        </pre>
      </section>
    </div>
  );
}
