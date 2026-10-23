import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Split from "react-split";
import { api } from "../api/ipc";

type GradleOutput = {
  id: string;
  type: "stdout" | "stderr" | "exit";
  data?: string;
  code?: number;
};

type GradleTask = {
  name: string;
  description: string;
  group: string;
};

type Props = {
  open: boolean;
  workspaceRoot: string;
};

const COMMON_TASKS: GradleTask[] = [
  {
    name: "runClient",
    description: "Launch Minecraft with your mod",
    group: "Minecraft",
  },
  {
    name: "runClientAuth",
    description: "Microsoft sign-in (auth run config required)",
    group: "Minecraft",
  },
  {
    name: "runServer",
    description: "Launch a modded Minecraft server",
    group: "Minecraft",
  },
  { name: "build", description: "Build and check the project", group: "Build" },
  {
    name: "clean",
    description: "Delete generated build files",
    group: "Build",
  },
  { name: "assemble", description: "Assemble project outputs", group: "Build" },
  {
    name: "check",
    description: "Run verification tasks",
    group: "Verification",
  },
  { name: "test", description: "Run project tests", group: "Verification" },
  { name: "tasks", description: "List available Gradle tasks", group: "Help" },
  {
    name: "dependencies",
    description: "Show project dependencies",
    group: "Help",
  },
  { name: "properties", description: "Show project properties", group: "Help" },
];

const MAX_OUTPUT_LENGTH = 200_000;

export default function GradlePanel({ open, workspaceRoot }: Props) {
  const [tasks, setTasks] = useState<GradleTask[]>(COMMON_TASKS);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runningTask, setRunningTask] = useState<string | null>(null);
  const [wrapperChecked, setWrapperChecked] = useState(false);
  const [contentSizes, setContentSizes] = useState<number[]>([55, 45]);
  const processIdRef = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const wrapperRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWrapperChecked(false);
    const findWrapper = async () => {
      const candidates =
        navigator.platform.toLowerCase().includes("win") ||
        /windows/i.test(navigator.userAgent)
          ? ["gradlew.bat", "gradlew"]
          : ["gradlew", "gradlew.bat"];
      for (const candidate of candidates) {
        const separator = workspaceRoot.includes("\\") ? "\\" : "/";
        const path = `${workspaceRoot.replace(/[\\/]+$/, "")}${separator}${candidate}`;
        const stat = await api.fs.stat(path);
        if (!stat?.error && !stat?.isDirectory) {
          if (!cancelled) wrapperRef.current = candidate;
          if (!cancelled) setWrapperChecked(true);
          return;
        }
      }
      if (!cancelled) {
        wrapperRef.current = null;
        setWrapperChecked(true);
      }
    };
    void findWrapper().catch((inspectError: unknown) => {
      if (!cancelled) {
        setWrapperChecked(true);
        setError(`Could not inspect Gradle wrapper: ${String(inspectError)}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot]);

  useEffect(() => {
    let cancelled = false;
    void api.settings
      .get("gradlePanelSizes")
      .then((sizes: unknown) => {
        if (
          !cancelled &&
          Array.isArray(sizes) &&
          sizes.length === 2 &&
          sizes.every((size) => typeof size === "number" && size > 0)
        ) {
          setContentSizes(sizes);
        }
      })
      .catch((settingsError: unknown) => {
        if (!cancelled) {
          setError(
            `Could not restore Gradle panel sizes: ${String(settingsError)}`,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stop = useCallback(async () => {
    const processId = processIdRef.current;
    if (!processId) return;
    const result = await api.terminal.stop(processId);
    if (result?.error) setError(result.error);
  }, []);

  useEffect(
    () => () => {
      unsubscribeRef.current?.();
      if (processIdRef.current) void api.terminal.stop(processIdRef.current);
    },
    [],
  );

  useEffect(() => {
    if (open || !processIdRef.current) return;
    void stop();
  }, [open, stop]);

  const tasksByGroup = useMemo(
    () =>
      tasks.reduce<Record<string, GradleTask[]>>((groups, task) => {
        (groups[task.group] ??= []).push(task);
        return groups;
      }, {}),
    [tasks],
  );

  const runTask = async (taskName: string) => {
    if (!wrapperChecked) {
      setError("Checking for a project Gradle wrapper. Try again in a moment.");
      return;
    }
    if (processIdRef.current) {
      setError("Stop the running Gradle task before starting another.");
      return;
    }
    if (!/^:?[A-Za-z][A-Za-z0-9_.:-]*$/.test(taskName)) {
      setError(
        "Gradle task names may only contain letters, numbers, '.', ':', '_' and '-'.",
      );
      return;
    }

    setError(null);
    const taskArguments = taskName === "tasks" ? "tasks --all" : taskName;
    setOutput(`> ${wrapperRef.current ?? "gradle"} ${taskArguments}\r\n`);
    setRunningTask(taskName);
    unsubscribeRef.current?.();
    unsubscribeRef.current = api.on(
      "terminal.output",
      (event: GradleOutput) => {
        if (event.id !== processIdRef.current) return;
        if (event.type === "exit") {
          setOutput((previous) =>
            `${previous}\r\nGradle exited with code ${event.code ?? 1}.\r\n`.slice(
              -MAX_OUTPUT_LENGTH,
            ),
          );
          processIdRef.current = null;
          setRunningTask(null);
          unsubscribeRef.current?.();
          unsubscribeRef.current = null;
          return;
        }
        if (event.data) {
          setOutput((previous) =>
            `${previous}${event.data}`.slice(-MAX_OUTPUT_LENGTH),
          );
        }
      },
    );

    try {
      const started = await api.terminal.start(workspaceRoot);
      if ("error" in started) throw new Error(started.error);
      processIdRef.current = started.id;
      const executable = wrapperRef.current ?? "gradle";
      const command =
        navigator.platform.toLowerCase().includes("win") ||
        /windows/i.test(navigator.userAgent)
          ? `call ${executable} ${taskArguments} & exit\r`
          : `${wrapperRef.current ? `./${executable}` : executable} ${taskArguments}; exit\r`;
      const written = await api.terminal.write(started.id, command);
      if (written?.error) throw new Error(written.error);
    } catch (runError) {
      if (processIdRef.current) void api.terminal.stop(processIdRef.current);
      processIdRef.current = null;
      setRunningTask(null);
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setError(String(runError));
    }
  };

  const refreshTasks = async () => {
    await runTask("tasks");
  };

  useEffect(() => {
    const plainOutput = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    const discovered = new Map<string, GradleTask>();
    for (const line of plainOutput.split(/\r?\n/)) {
      const match = line.match(
        /^\s*(:?[A-Za-z][A-Za-z0-9_.:-]*)(?:\s+-\s+(.+?))?\s*$/,
      );
      if (match) {
        discovered.set(match[1], {
          name: match[1],
          description: match[2] ?? "Project task",
          group: "Project tasks",
        });
      }
    }
    if (discovered.size) {
      setTasks((previous) => {
        const merged = new Map(previous.map((task) => [task.name, task]));
        for (const task of discovered.values()) merged.set(task.name, task);
        return [...merged.values()].sort(
          (a, b) =>
            a.group.localeCompare(b.group) || a.name.localeCompare(b.name),
        );
      });
    }
  }, [output]);

  if (!open) return null;

  return (
    <section className="gradle-panel" aria-label="Gradle tasks">
      <header className="dock-panel-header">
        <div>
          <strong>Gradle</strong>
          <span className="gradle-project-name">
            {workspaceRoot.split(/[\\/]/).filter(Boolean).pop()}
          </span>
        </div>
        <button
          className="icon-button"
          onClick={() => void refreshTasks()}
          disabled={Boolean(runningTask) || !wrapperChecked}
          title="Refresh tasks from Gradle"
        >
          ↻
        </button>
      </header>
      <p className="gradle-hint">
        Double-click a task to run it.{" "}
        {!wrapperChecked
          ? "Checking for Gradle wrapper…"
          : wrapperRef.current
            ? "Using the project wrapper."
            : "Using Gradle from PATH."}
      </p>
      <Split
        className="gradle-content-split"
        sizes={contentSizes}
        minSize={[120, 100]}
        gutterSize={6}
        direction="vertical"
        onDragEnd={(sizes: number[]) => {
          setContentSizes(sizes);
          void api.settings.set("gradlePanelSizes", sizes);
        }}
      >
        <div className="gradle-task-list">
          {Object.entries(tasksByGroup).map(([group, groupTasks]) => (
            <section className="gradle-task-group" key={group}>
              <h3>{group}</h3>
              {groupTasks.map((task) => (
                <button
                  className={`gradle-task ${runningTask === task.name ? "running" : ""}`}
                  key={task.name}
                  onDoubleClick={() => void runTask(task.name)}
                  title={`Double-click to run ${task.name}`}
                  disabled={Boolean(runningTask) || !wrapperChecked}
                >
                  <span className="gradle-task-name">
                    <span aria-hidden="true">▶</span>
                    {task.name}
                  </span>
                  <span className="gradle-task-description">
                    {task.description}
                  </span>
                </button>
              ))}
            </section>
          ))}
        </div>
        <div className="gradle-output-area">
          <div className="gradle-output-header">
            <strong>
              {runningTask ? `Running ${runningTask}` : "Task output"}
            </strong>
            {runningTask && <button onClick={() => void stop()}>Stop</button>}
            {!runningTask && output && (
              <button onClick={() => setOutput("")}>Clear</button>
            )}
          </div>
          {error && <div className="explorer-error">{error}</div>}
          <pre className="gradle-output">
            {output || "Select a Gradle task to see its output."}
          </pre>
        </div>
      </Split>
    </section>
  );
}
