import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/ipc";
import "../styles.css";

type DebugMessage = {
  type?: string;
  request_seq?: number;
  command?: string;
  success?: boolean;
  event?: string;
  body?: Record<string, any>;
  message?: string;
};

type DebugOutput = {
  id: string;
  type: "message" | "stderr" | "exit";
  message?: DebugMessage;
  data?: string;
  code?: number;
};

type Props = {
  open: boolean;
  rootPath: string;
  activeFilePath: string | null;
  onClose: () => void;
};

export default function DebugPanel({
  open,
  rootPath,
  activeFilePath,
  onClose,
}: Props) {
  const [command, setCommand] = useState("");
  const [adapterArgs, setAdapterArgs] = useState("[]");
  const [launchConfig, setLaunchConfig] = useState(
    '{\n  "name": "Launch",\n  "type": "python",\n  "request": "launch",\n  "program": "${file}"\n}',
  );
  const [breakpointLines, setBreakpointLines] = useState("1");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(1);
  const sessionRef = useRef<string | null>(null);
  const launchConfigRef = useRef<Record<string, unknown> | null>(null);
  const threadIdRef = useRef<number | null>(null);

  const resolveLaunchValues = useCallback(
    (value: unknown): unknown => {
      if (typeof value === "string") {
        const file = activeFilePath ?? "";
        const normalized = file.replace(/\\/g, "/");
        const workspace = rootPath.replace(/\\/g, "/").replace(/\/$/, "");
        const directory = normalized.includes("/")
          ? normalized.slice(0, normalized.lastIndexOf("/"))
          : "";
        const baseName = workspace.split("/").pop() ?? workspace;
        const variables: Record<string, string> = {
          file,
          fileDirname: directory,
          workspaceFolder: rootPath,
          workspaceFolderBasename: baseName,
        };
        return value.replace(/\$\{([^}]+)\}/g, (placeholder, name: string) =>
          variables[name] ?? placeholder,
        );
      }
      if (Array.isArray(value)) return value.map(resolveLaunchValues);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [
            key,
            resolveLaunchValues(item),
          ]),
        );
      }
      return value;
    },
    [activeFilePath, rootPath],
  );
  const responseRolesRef = useRef(new Map<number, string>());

  const sendRequest = useCallback(
    async (name: string, args: Record<string, unknown>, role?: string) => {
      const id = sessionRef.current;
      if (!id) return;
      const seq = sequenceRef.current++;
      if (role) responseRolesRef.current.set(seq, role);
      const result = await api.debug.send(id, {
        seq,
        type: "request",
        command: name,
        arguments: args,
      });
      if (result?.error) setError(result.error);
      return seq;
    },
    [],
  );
  const sendRequestRef = useRef(sendRequest);
  sendRequestRef.current = sendRequest;

  useEffect(() => {
    if (!sessionId) return;
    return api.on("debug.output", (event: DebugOutput) => {
      if (event.id !== sessionRef.current) return;
      if (event.type === "stderr") {
        setOutput((lines) => [...lines, event.data ?? ""].slice(-1000));
        return;
      }
      if (event.type === "exit") {
        setOutput((lines) =>
          [
            ...lines,
            `Debug adapter exited with code ${event.code ?? 1}.`,
          ].slice(-1000),
        );
        sessionRef.current = null;
        setSessionId(null);
        return;
      }

      const message = event.message;
      if (!message) return;
      if (message.type === "response" && message.request_seq !== undefined) {
        const role = responseRolesRef.current.get(message.request_seq);
        responseRolesRef.current.delete(message.request_seq);
        if (!message.success) {
          setOutput((lines) =>
            [
              ...lines,
              `DAP ${message.command} failed: ${message.message ?? ""}`,
            ].slice(-1000),
          );
          return;
        }
        if (role === "initialize") {
          const config = launchConfigRef.current;
          if (!config) return;
          const launchArguments = resolveLaunchValues(config) as Record<
            string,
            unknown
          >;
          const request =
            launchArguments.request === "attach" ? "attach" : "launch";
          void sendRequestRef.current(request, launchArguments, "launch");
        } else if (role === "breakpoints") {
          void sendRequestRef.current("configurationDone", {});
        } else if (role === "threads") {
          const threads = message.body?.threads;
          const threadId = Array.isArray(threads) ? threads[0]?.id : undefined;
          if (typeof threadId === "number") {
            threadIdRef.current = threadId;
            void sendRequestRef.current(
              "stackTrace",
              { threadId, startFrame: 0, levels: 40 },
              "stackTrace",
            );
          }
        } else if (role === "stackTrace") {
          const frames = message.body?.stackFrames;
          if (Array.isArray(frames)) {
            setOutput((lines) =>
              [
                ...lines,
                ...frames.map(
                  (frame) =>
                    `#${frame.id} ${frame.name} (${frame.source?.path ?? "unknown"}:${frame.line ?? 0})`,
                ),
              ].slice(-1000),
            );
            if (typeof frames[0]?.id === "number") {
              void sendRequestRef.current(
                "scopes",
                { frameId: frames[0].id },
                "scopes",
              );
            }
          }
        } else if (role === "scopes") {
          const scopes = message.body?.scopes;
          if (Array.isArray(scopes)) {
            for (const scope of scopes) {
              if (
                typeof scope.variablesReference === "number" &&
                scope.variablesReference > 0
              ) {
                void sendRequestRef.current(
                  "variables",
                  { variablesReference: scope.variablesReference },
                  "variables",
                );
              }
            }
          }
        } else if (role === "variables") {
          const variables = message.body?.variables;
          if (Array.isArray(variables)) {
            setOutput((lines) =>
              [
                ...lines,
                ...variables
                  .slice(0, 100)
                  .map(
                    (variable) =>
                      `${variable.name} = ${variable.value ?? variable.type ?? ""}`,
                  ),
              ].slice(-1000),
            );
          }
        }
        return;
      }

      if (message.type === "event") {
        if (message.event === "initialized") {
          const filePath = activeFilePath;
          const lines = breakpointLines
            .split(",")
            .map((value) => Number(value.trim()))
            .filter((line) => Number.isInteger(line) && line > 0);
          if (filePath && lines.length) {
            void sendRequestRef.current(
              "setBreakpoints",
              {
                source: { path: filePath },
                breakpoints: [...new Set(lines)].map((line) => ({ line })),
                sourceModified: false,
              },
              "breakpoints",
            );
          } else {
            void sendRequestRef.current("configurationDone", {});
          }
        } else if (message.event === "stopped") {
          setOutput((current) =>
            [
              ...current,
              `Stopped: ${message.body?.reason ?? "breakpoint"}`,
            ].slice(-1000),
          );
          void sendRequestRef.current("threads", {}, "threads");
        } else if (message.event === "output") {
          setOutput((current) =>
            [...current, String(message.body?.output ?? "")].slice(-1000),
          );
        } else {
          setOutput((current) =>
            [...current, `DAP event: ${message.event}`].slice(-1000),
          );
        }
      }
    });
  }, [activeFilePath, breakpointLines, resolveLaunchValues, sessionId]);

  useEffect(
    () => () => {
      if (sessionRef.current) void api.debug.stop(sessionRef.current);
      sessionRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (open || !sessionRef.current) return;
    void stop();
  }, [open]);

  const start = async () => {
    setError(null);
    setOutput([]);
    try {
      const args: unknown = JSON.parse(adapterArgs);
      const config: unknown = JSON.parse(launchConfig);
      if (
        !Array.isArray(args) ||
        args.some((argument) => typeof argument !== "string") ||
        !config ||
        typeof config !== "object" ||
        Array.isArray(config)
      ) {
        throw new Error(
          "Adapter arguments or launch configuration are invalid.",
        );
      }
      launchConfigRef.current = config as Record<string, unknown>;
      const result = await api.debug.start({
        rootPath,
        command,
        args: args as string[],
      });
      if (!result || "error" in result) {
        throw new Error(result?.error || "Could not start debug adapter.");
      }
      sequenceRef.current = 1;
      responseRolesRef.current.clear();
      sessionRef.current = result.id;
      setSessionId(result.id);
      const initializeSeq = sequenceRef.current++;
      responseRolesRef.current.set(initializeSeq, "initialize");
      const sendResult = await api.debug.send(result.id, {
        seq: initializeSeq,
        type: "request",
        command: "initialize",
        arguments: {
          clientID: "zephra-studio",
          clientName: "Zephra Studio",
          adapterID: "zephra-configured-adapter",
          pathFormat: "path",
          linesStartAt1: true,
          columnsStartAt1: true,
          supportsRunInTerminalRequest: false,
          supportsVariableType: true,
          supportsVariablePaging: true,
        },
      });
      if (sendResult?.error) throw new Error(sendResult.error);
    } catch (startError) {
      setError(String(startError));
      if (sessionRef.current) {
        await api.debug.stop(sessionRef.current);
        sessionRef.current = null;
        setSessionId(null);
      }
    }
  };

  const control = async (name: string) => {
    setError(null);
    const result = await sendRequest(
      name,
      threadIdRef.current === null ? {} : { threadId: threadIdRef.current },
    );
    if (result === undefined) setError("The debug adapter is not running.");
  };

  const stop = async () => {
    if (!sessionRef.current) return;
    const result = await api.debug.stop(sessionRef.current);
    if (result?.error) setError(result.error);
    sessionRef.current = null;
    setSessionId(null);
  };

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <section
        className="command-palette debug-panel"
        onClick={(event) => event.stopPropagation()}
        aria-labelledby="debug-panel-title"
      >
        <header className="addon-manager-header">
          <div>
            <h2 id="debug-panel-title">Debugger · DAP</h2>
            <p>
              Connect a locally installed Debug Adapter Protocol server. Adapter
              execution and the debugged program run with your user permissions.
            </p>
          </div>
          <button className="addon-manager-close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="debug-form">
          <label>
            Adapter executable
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="debugpy, codelldb, or adapter path"
              disabled={!!sessionId}
            />
          </label>
          <label>
            Adapter arguments (JSON array)
            <input
              value={adapterArgs}
              onChange={(event) => setAdapterArgs(event.target.value)}
              disabled={!!sessionId}
            />
          </label>
          <label>
            Launch configuration (DAP JSON)
            <textarea
              value={launchConfig}
              onChange={(event) => setLaunchConfig(event.target.value)}
              rows={5}
              disabled={!!sessionId}
              spellCheck={false}
            />
          </label>
          <label>
            Breakpoint lines in active file (
            {activeFilePath || "no active file"})
            <input
              value={breakpointLines}
              onChange={(event) => setBreakpointLines(event.target.value)}
              placeholder="12, 24"
              disabled={!!sessionId}
            />
          </label>
        </div>
        <div className="debug-controls">
          {!sessionId ? (
            <button onClick={() => void start()} disabled={!command.trim()}>
              Start Debugging
            </button>
          ) : (
            <>
              <button onClick={() => void control("continue")}>Continue</button>
              <button onClick={() => void control("next")}>Step Over</button>
              <button onClick={() => void control("stepIn")}>Step In</button>
              <button onClick={() => void control("stepOut")}>Step Out</button>
              <button onClick={() => void control("pause")}>Pause</button>
              <button onClick={() => void stop()}>Stop</button>
            </>
          )}
        </div>
        {error && <p className="addon-manager-message error">{error}</p>}
        <pre className="debug-output" aria-live="polite">
          {output.join("\n") || "Debug adapter output will appear here."}
        </pre>
      </section>
    </div>
  );
}
