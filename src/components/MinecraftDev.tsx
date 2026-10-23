import React, { useEffect, useRef, useState } from "react";
import { api } from "../api/ipc";
import { MinecraftPackValidation } from "../types";

type ProjectType = "resource-pack" | "data-pack" | "mod";
type ModLoader = "fabric" | "forge" | "neoforge";
type MinecraftVersionOption = {
  version: string;
  modLoaders: ModLoader[];
};
type BuildOutput = {
  type: "stdout" | "stderr" | "exit";
  data?: string;
  code?: number;
};
type CrashAnalysis = {
  findingCount: number;
  summary: string;
  findings: Array<{
    severity: "high" | "medium";
    title: string;
    line: number;
    excerpt: string;
    guidance: string;
  }>;
};

const MAX_BUILD_OUTPUT_LENGTH = 200_000;

type Props = {
  open: boolean;
  onClose: () => void;
  onOpenProject: (path: string) => void;
};

export default function MinecraftDev({ open, onClose, onOpenProject }: Props) {
  const [supportedVersions, setSupportedVersions] = useState<
    MinecraftVersionOption[]
  >([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [type, setType] = useState<ProjectType>("data-pack");
  const [modLoader, setModLoader] = useState<ModLoader>("fabric");
  const [name, setName] = useState("My Minecraft Pack");
  const [namespace, setNamespace] = useState("my_minecraft_pack");
  const [description, setDescription] = useState("");
  const [minecraftVersion, setMinecraftVersion] = useState("1.21.4");
  const [destination, setDestination] = useState<string | null>(null);
  const [validationPath, setValidationPath] = useState<string | null>(null);
  const [validation, setValidation] = useState<MinecraftPackValidation | null>(
    null,
  );
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPath, setCreatedPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [buildBusy, setBuildBusy] = useState(false);
  const [buildOutput, setBuildOutput] = useState<BuildOutput[]>([]);
  const [crashAnalysis, setCrashAnalysis] = useState<CrashAnalysis | null>(
    null,
  );
  const [analyzingCrashLog, setAnalyzingCrashLog] = useState(false);
  const buildProcessRef = useRef<string | null>(null);
  const unsubscribeBuildRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      unsubscribeBuildRef.current?.();
      if (buildProcessRef.current) {
        void api.terminal.stop(buildProcessRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (open || !buildProcessRef.current) return;
    void api.terminal.stop(buildProcessRef.current);
    buildProcessRef.current = null;
    setBuildBusy(false);
    unsubscribeBuildRef.current?.();
    unsubscribeBuildRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCreatedPath(null);
    setBuildOutput([]);
    setValidation(null);
    setLoadingVersions(true);
    api.minecraft
      .listVersions()
      .then((versions: MinecraftVersionOption[]) => {
        setSupportedVersions(versions);
        if (versions.length) {
          setMinecraftVersion((current) =>
            versions.some(({ version }) => version === current)
              ? current
              : "1.21.4",
          );
        }
      })
      .catch((versionError: unknown) => setError(String(versionError)))
      .finally(() => setLoadingVersions(false));
  }, [open]);

  if (!open) return null;

  const visibleVersions =
    type === "mod"
      ? supportedVersions.filter((version) =>
          version.modLoaders.includes(modLoader),
        )
      : supportedVersions;

  const changeProjectType = (nextType: ProjectType) => {
    setType(nextType);
    const candidates =
      nextType === "mod"
        ? supportedVersions.filter((version) =>
            version.modLoaders.includes(modLoader),
          )
        : supportedVersions;
    if (!candidates.some(({ version }) => version === minecraftVersion)) {
      setMinecraftVersion(
        candidates.some(({ version }) => version === "1.21.1")
          ? "1.21.1"
          : candidates[0]?.version || "",
      );
    }
  };

  const changeModLoader = (nextLoader: ModLoader) => {
    setModLoader(nextLoader);
    const candidates = supportedVersions.filter((version) =>
      version.modLoaders.includes(nextLoader),
    );
    if (!candidates.some(({ version }) => version === minecraftVersion)) {
      setMinecraftVersion(
        candidates.some(({ version }) => version === "1.21.1")
          ? "1.21.1"
          : candidates[0]?.version || "",
      );
    }
  };

  const chooseDestination = async () => {
    setError(null);
    try {
      const selected = await api.project.chooseDirectory();
      if (selected) setDestination(selected);
    } catch (selectionError) {
      setError(String(selectionError));
    }
  };

  const createProject = async () => {
    if (!destination) {
      setError("Choose a parent folder for the new project.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.minecraft.createProject({
        type,
        modLoader: type === "mod" ? modLoader : undefined,
        name,
        namespace,
        description,
        minecraftVersion,
        destination,
      });
      if (!result?.success)
        throw new Error(result?.error || "Project creation failed.");
      setCreatedPath(result.path);
    } catch (creationError) {
      setError(String(creationError));
    } finally {
      setBusy(false);
    }
  };

  const buildMod = async () => {
    if (type !== "mod" || !createdPath) return;
    setBuildBusy(true);
    setBuildOutput([]);
    setError(null);
    unsubscribeBuildRef.current?.();
    unsubscribeBuildRef.current = api.on(
      "terminal.output",
      (output: BuildOutput & { id: string }) => {
        if (output.id !== buildProcessRef.current) return;
        setBuildOutput((previous) => {
          const next = [...previous, output];
          let totalLength = next.reduce(
            (length, entry) => length + (entry.data?.length ?? 0),
            0,
          );
          while (next.length > 1 && totalLength > MAX_BUILD_OUTPUT_LENGTH) {
            const removed = next.shift();
            totalLength -= removed?.data?.length ?? 0;
          }
          return next;
        });
        if (output.type === "exit") {
          buildProcessRef.current = null;
          setBuildBusy(false);
          unsubscribeBuildRef.current?.();
          unsubscribeBuildRef.current = null;
        }
      },
    );
    try {
      const result = await api.terminal.start(createdPath);
      if (result?.error) throw new Error(result.error);
      if (!result?.id) throw new Error("Could not start the mod build shell.");
      buildProcessRef.current = result.id;
      const writeResult = await api.terminal.write(result.id, "gradle build\n");
      if (writeResult?.error) {
        await api.terminal.stop(result.id);
        buildProcessRef.current = null;
        throw new Error(writeResult.error);
      }
    } catch (buildError) {
      buildProcessRef.current = null;
      setBuildBusy(false);
      unsubscribeBuildRef.current?.();
      unsubscribeBuildRef.current = null;
      setError(String(buildError));
    }
  };

  const stopModBuild = async () => {
    const processId = buildProcessRef.current;
    if (!processId) return;
    try {
      const result = await api.terminal.stop(processId);
      if (result?.error) throw new Error(result.error);
    } catch (stopError) {
      setError(String(stopError));
    }
  };

  const chooseValidationFolder = async () => {
    setError(null);
    try {
      const selected = await api.project.chooseDirectory();
      if (selected) {
        setValidationPath(selected);
        setValidation(null);
      }
    } catch (selectionError) {
      setError(String(selectionError));
    }
  };

  const validatePack = async () => {
    if (!validationPath) {
      setError("Choose an existing pack folder to validate.");
      return;
    }
    setValidating(true);
    setError(null);
    setValidation(null);
    try {
      const result = await api.minecraft.validatePack(validationPath, {
        type,
        minecraftVersion,
      });
      if (!result || "error" in result) {
        throw new Error(result?.error || "Pack validation failed.");
      }
      setValidation(result);
    } catch (validationError) {
      setError(String(validationError));
    } finally {
      setValidating(false);
    }
  };

  const analyzeCrashLog = async () => {
    setAnalyzingCrashLog(true);
    setError(null);
    setCrashAnalysis(null);
    try {
      const result = await api.minecraft.analyzeCrashLog();
      if (result === null) return;
      if ("error" in result) throw new Error(result.error);
      setCrashAnalysis(result);
    } catch (analysisError) {
      setError(String(analysisError));
    } finally {
      setAnalyzingCrashLog(false);
    }
  };

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <section
        className="command-palette minecraft-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="minecraft-wizard-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="minecraft-wizard-header">
          <div>
            <h2 id="minecraft-wizard-title">Minecraft Dev</h2>
            <p>
              Create a version-targeted Minecraft mod, resource pack, or data
              pack.
            </p>
          </div>
          <button
            className="addon-manager-close"
            onClick={onClose}
            aria-label="Close Minecraft Dev"
          >
            ×
          </button>
        </header>

        <div className="minecraft-wizard-content">
          <label className="minecraft-field">
            Project type
            <select
              value={type}
              onChange={(event) =>
                changeProjectType(event.target.value as ProjectType)
              }
              disabled={loadingVersions || busy}
            >
              <option value="mod">Java mod</option>
              <option value="data-pack">Data pack</option>
              <option value="resource-pack">Resource pack</option>
            </select>
          </label>
          {type === "mod" && (
            <label className="minecraft-field">
              Mod loader
              <select
                value={modLoader}
                onChange={(event) =>
                  changeModLoader(event.target.value as ModLoader)
                }
                disabled={loadingVersions || busy}
              >
                <option value="fabric">Fabric</option>
                <option value="forge">Forge</option>
                <option value="neoforge">NeoForge</option>
              </select>
            </label>
          )}
          <label className="minecraft-field">
            Project name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
          </label>
          <label className="minecraft-field">
            {type === "mod" ? "Mod ID" : "Namespace"}
            <input
              value={namespace}
              onChange={(event) => setNamespace(event.target.value)}
              maxLength={64}
              spellCheck={false}
              pattern={type === "mod" ? "[a-z][a-z0-9_]{1,63}" : undefined}
            />
          </label>
          <label className="minecraft-field">
            Description
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={240}
            />
          </label>
          <label className="minecraft-field">
            Target Minecraft version
            <select
              value={minecraftVersion}
              onChange={(event) => setMinecraftVersion(event.target.value)}
              disabled={loadingVersions || visibleVersions.length === 0}
            >
              {visibleVersions.map(({ version }) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>

          <div className="minecraft-destination">
            <div>
              <strong>Parent folder</strong>
              <span>{destination || "No destination selected"}</span>
              {destination && (
                <small>
                  Project folder:{" "}
                  {name
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]+/g, "-")
                    .replace(/^-+|-+$/g, "") || "(invalid name)"}
                </small>
              )}
            </div>
            <button
              className="toolbar-button"
              onClick={chooseDestination}
              disabled={busy}
            >
              Choose…
            </button>
          </div>

          <div className="minecraft-template-note">
            {loadingVersions ? "Loading supported Minecraft versions… " : ""}
            Supported targets:{" "}
            {visibleVersions
              .map(({ version }) => `Minecraft ${version}`)
              .join(", ") || "none"}
            .{" "}
            {type === "mod"
              ? `Loader: ${modLoader}. NeoForge does not support Minecraft 1.20.1. Mod projects include Java and Gradle starter files.`
              : "Existing project folders are never overwritten."}
          </div>
          {type !== "mod" && (
            <section className="minecraft-validator">
              <h3>Validate Existing Pack</h3>
              <p>
                Check pack metadata, JSON files, namespaces, and data function
                paths. Validation only reads files.
              </p>
              <div className="minecraft-destination">
                <span>{validationPath || "No pack folder selected"}</span>
                <button
                  className="toolbar-button"
                  onClick={chooseValidationFolder}
                  disabled={busy || validating}
                >
                  Choose Pack…
                </button>
              </div>
              <button
                className="primary"
                onClick={validatePack}
                disabled={
                  !validationPath ||
                  loadingVersions ||
                  supportedVersions.length === 0 ||
                  busy ||
                  validating
                }
              >
                {validating ? "Validating…" : "Validate Pack"}
              </button>
              {validation && (
                <div
                  className={`minecraft-validation-result ${validation.valid ? "valid" : "invalid"}`}
                  role="status"
                >
                  <strong>
                    {validation.valid
                      ? "No errors found"
                      : `${validation.errors.length} error${validation.errors.length === 1 ? "" : "s"} found`}
                  </strong>
                  <span>
                    {validation.fileCount} files ·{" "}
                    {validation.type || "pack type not detected"} · Minecraft{" "}
                    {validation.minecraftVersion}
                  </span>
                  {validation.errors.map((message, index) => (
                    <span className="validation-error" key={`error-${index}`}>
                      {message}
                    </span>
                  ))}
                  {validation.warnings.map((message, index) => (
                    <span
                      className="validation-warning"
                      key={`warning-${index}`}
                    >
                      {message}
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}
          <section className="minecraft-validator">
            <h3>Analyze Crash Log</h3>
            <p>
              Scan a local crash report or latest.log (up to 2 MB) for common
              Java, mod dependency, mixin, and tick-loop failures.
            </p>
            <button
              className="primary"
              onClick={() => void analyzeCrashLog()}
              disabled={analyzingCrashLog}
            >
              {analyzingCrashLog ? "Analyzing…" : "Choose Log to Analyze…"}
            </button>
            {crashAnalysis && (
              <div className="minecraft-validation-result" role="status">
                <strong>{crashAnalysis.summary}</strong>
                {crashAnalysis.findings.map((finding, index) => (
                  <div
                    className={`crash-finding crash-finding-${finding.severity}`}
                    key={`${finding.title}-${index}`}
                  >
                    <strong>
                      {finding.title} · line {finding.line}
                    </strong>
                    <code>{finding.excerpt}</code>
                    <span>{finding.guidance}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          {error && <div className="addon-manager-message error">{error}</div>}
          {createdPath && (
            <div className="minecraft-created">
              <span>Project created at {createdPath}</span>
              <button
                className="primary"
                onClick={() => onOpenProject(createdPath)}
              >
                Open Project
              </button>
              {type === "mod" && (
                <button
                  className="primary"
                  onClick={() => void buildMod()}
                  disabled={busy || buildBusy}
                >
                  {buildBusy ? "Building…" : "Build Mod"}
                </button>
              )}
            </div>
          )}
          {type === "mod" && (buildBusy || buildOutput.length > 0) && (
            <section
              className="minecraft-validator"
              aria-label="Mod build output"
            >
              <div className="minecraft-destination">
                <h3>Mod Build Output</h3>
                <button
                  className="toolbar-button"
                  onClick={() => void stopModBuild()}
                  disabled={!buildBusy}
                >
                  Stop Build
                </button>
              </div>
              <div className="terminal-body" aria-live="polite">
                {buildOutput.map((entry, index) => (
                  <pre
                    key={`${entry.type}-${index}`}
                    className={
                      entry.type === "stderr"
                        ? "output-stderr"
                        : entry.type === "exit"
                          ? "output-meta"
                          : "output-stdout"
                    }
                  >
                    {entry.type === "exit"
                      ? `\n[Gradle exited with code ${entry.code ?? 1}]\n`
                      : entry.data}
                  </pre>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="minecraft-wizard-footer">
          <button className="toolbar-button" onClick={onClose}>
            Close
          </button>
          <button
            className="primary"
            onClick={createProject}
            disabled={
              busy ||
              loadingVersions ||
              visibleVersions.length === 0 ||
              Boolean(createdPath)
            }
          >
            {busy ? "Creating…" : "Create Project"}
          </button>
        </footer>
      </section>
    </div>
  );
}
