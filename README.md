# Zephra Studio

A modern desktop IDE for the Zephra programming language, built with Electron, React, TypeScript, and Monaco Editor.

For the complete user guide, development reference, and `.zph` add-on author
documentation, see [documentation/README.md](documentation/README.md).

## Current verified capabilities

- Multi-tab code editing with Monaco Editor
- Workspace folder support (open folders, browse and edit files)
- Run output panel and an interactive workspace terminal with PTY, resize, and
  terminal emulation support
- Command palette (Ctrl+Shift+P) and workspace search (Ctrl+Shift+F)
- Resizable left/editor/right work areas, replaceable Explorer/Gradle and
  Output/Terminal panels, a reorderable toolbar, and theme/accent customization
- File explorer with create/rename/delete
- Auto-save and manual save support
- Workspace, open-tab, active-tab, and unsaved-buffer session recovery
- Manual editor snapshots of open tabs, restorable as dirty buffers
- Full-project source snapshots with bounded archives and restore-to-new-folder
- Test Explorer discovery and execution for npm test scripts, Python unittest
  directories, and Gradle test projects
- Heuristic local Minecraft crash-log analysis for common JVM and mod-loader failures
- Active-file highlighting and expanded-folder refresh on filesystem changes
- Dark and light themes
- Zephra syntax highlighting and execution, with parser/runtime error output
- Multi-language syntax support (JS/TS, Java, Gradle/Groovy, Kotlin, Python,
  C++, HTML, CSS, JSON, Markdown)
- Language tool discovery for installed runtimes, compilers, formatters, and
  language-server executables, plus stdio LSP diagnostics, completion, hover,
  and definition for configured servers
- Generic Debug Adapter Protocol client with launch, breakpoints, stack frames,
  and step controls for locally configured adapters
- Git status, per-file stage/unstage, commits, local branch switching/creation,
  and configured remote fetch/pull/push
- Zephra Studio add-ons written entirely as `.zph` files
- VSIX theme/snippet contribution support without running extension code
- Minecraft mod, resource-pack, and data-pack starter generation for the versions listed below
- One-click Gradle build for newly generated mod projects, with build output
- Gradle task panel with wrapper detection, discovered project tasks, and
  double-click-to-run actions including `runClient`
- Read-only Minecraft pack validation for metadata, JSON, namespaces, and function paths
- Windows installer packaging through `electron-builder`

The capability list is intentionally limited to features implemented in the
current application. LSP and debugging require a separately installed and
configured language server or DAP adapter; arbitrary VS Code extension
activation is not supported. Git operations use configured repository and
remote names; pulls are fast-forward-only and require a clean worktree.

## Studio layout and customization

Use the centered **Search commands…** field at the top of the window, or press
**Ctrl+Shift+P**, to find and run Studio commands. The **File** menu contains
Open Folder, New File, Save, and Save All. Drag toolbar actions to change their
order; the order is saved automatically.

The left activity rail switches between Explorer and Gradle. The right dock
switches between Output and Terminal. Drag the dividers between the left dock,
editor, and right dock to resize them; panel sizes and selections are saved.
Choose **Customize** (the gear in the left activity rail or its toolbar action)
to switch between Midnight and Daylight themes, choose an accent color, or
select which panels are shown.

## Gradle tasks and Minecraft client

Open a mod project folder, select the Gradle icon in the left activity rail,
then double-click a task to run it. The panel includes common Gradle tasks such
as `build`, `clean`, `test`, `runClient`, and `runServer`. **Refresh tasks**
runs `gradle tasks --all` (or the project wrapper equivalent) and adds tasks
reported by the project. Running output is
shown in the panel, and **Stop** terminates the current Gradle process.

Generated mod projects also include `runClientAuth`. Double-click it to sign
in using Microsoft's device-code flow and launch the development client with
your account, which is useful for testing account skins. Zephra Studio does not
request or handle your Microsoft password. The underlying DevLogin component
stores access and refresh tokens unencrypted in `~/.devlogin`, outside the
project; delete that directory to remove the locally saved login. Do not use
this workflow on a shared or untrusted computer.

For an existing NeoForge project, add this run inside its `neoForge { runs { ... } }`
block, then refresh Gradle tasks:

```groovy
clientAuth {
    client()
    devLogin = true
}
```

For existing Fabric or Forge projects, follow the corresponding
[Fabric Loom](https://github.com/covers1624/DevLogin/wiki/Fabric%E2%80%90Loom) or
[ForgeGradle](https://github.com/covers1624/DevLogin/wiki/ForgeGradle) setup
guide, then refresh Gradle tasks in Zephra Studio. See the
[NeoForge ModDevGradle authenticated run docs](https://github.com/neoforged/ModDevGradle#using-authenticated-minecraft-accounts)
for more information.

If the project has `gradlew.bat`/`gradlew`, Zephra Studio uses that wrapper;
otherwise, install Gradle and ensure it is available on `PATH`. `runClient`
launches the modded Minecraft client using the project’s configured loader and
Minecraft version. The first run may download Minecraft and loader
dependencies. Use Java 17 for Minecraft 1.20.1 templates and Java 21 for
1.21.1 templates. Generated starter projects currently do not include a
Gradle wrapper. Use the stable Gradle 8.14.3 release with the generated
templates; do not use a Gradle release candidate.

If you already generated a NeoForge project before the client-run fix, open
its `build.gradle` and change the NeoForge run block from `client {}` to:

```groovy
client {
    client()
}
```

The explicit `client()` selects the run type required by ModDevGradle. New
NeoForge projects include it automatically.

---

## 🚀 Getting Started (Development)

### 1) Install dependencies

```bash
npm install
```

### 2) Run in development mode

This starts the Vite dev server and launches the Electron app.

```bash
npm run dev
```

### 3) Open a workspace

- Use `File -> Open Folder` or the `Open Folder` button in the UI.
- You can use the provided example project in `examples/hello`.

---

## 🧩 Building & Packaging

### Build the renderer and package the app

```bash
npm run build
```

This builds the frontend with Vite and then builds a Windows installer using `electron-builder`.

### Output

- Packaged installers will be placed in `dist/`.
- The installer currently targets x64 Windows. IA-32 is not included because
  the PTY dependency does not provide an IA-32 Windows binary.

### Custom App Icon

Zephra Studio uses a custom icon during packaging. A placeholder icon is generated automatically when you run `npm run build`.

To use your own logo (e.g., the attached Zephra logo), replace the files:

- `build/icon.png` (recommended size 512×512)
- `build/icon.ico` (Windows installer icon)

Then re-run `npm run build`.

---

## 🧠 Zephra Integration

Zephra Studio uses the runtime shipped in the `zephra/` folder. When you click **Run**, it executes:

```bash
python -m zephra path/to/file.zph
```

Use **Zephra Lab** to configure the Python executable. Workspace language settings
are stored in `zephra.toml` at the project root and are read when a Zephra file
starts.

---

## 🧪 Example Project

Open `examples/hello` as a workspace and run `main.zph` to start.

## Minecraft Dev

Choose **Minecraft Dev** in the toolbar or command palette to create a Java
mod, resource pack, or data pack. Resource/data pack templates support
Minecraft **1.20.1**, **1.21.1**, and **1.21.4**. Mod project templates support:

| Minecraft version | Fabric | Forge | NeoForge           | Java |
| ----------------- | ------ | ----- | ------------------ | ---- |
| 1.20.1            | Yes    | Yes   | No official target | 17   |
| 1.21.1            | Yes    | Yes   | Yes                | 21   |

NeoForge does not publish an official 1.20.1 target, so that combination is
excluded rather than presented as supported. Mod projects contain a starter
Java entrypoint, loader metadata, Gradle build files, and pinned loader
dependencies. Install a 64-bit JDK for the selected Minecraft version and
Gradle 8.14.3 separately; generated projects currently do not include the
Gradle wrapper. Gradle 9 is not currently supported by ForgeGradle. Use
**Build Mod** in the Minecraft Dev dialog to run `gradle build` for a
newly generated mod project and view the streamed output. The `gradle` command
must be on PATH. You can also open the project and use the Terminal for
`gradle runClient` or other Gradle tasks. Initial builds download Minecraft
and loader dependencies.

Minecraft Dev can also validate an existing resource/data pack folder. It
checks `pack.mcmeta`, target pack format, JSON syntax, namespace folder names,
and version-specific data-function paths. Validation is read-only and is
limited to the listed Minecraft versions and a bounded number of files.

The mod wizard currently creates starter projects rather than a complete mod
authoring framework. Java sources and Gradle build scripts use Monaco's
language syntax support. The in-wizard build button is available for newly
generated projects; arbitrary opened mod projects can be built from Terminal.
It does not create modpacks or server plugins. Loader APIs
and dependency versions can change; consult the linked official documentation
when extending or updating generated projects:
[Fabric](https://docs.fabricmc.net/),
[Forge](https://docs.minecraftforge.net/),
[NeoForge](https://docs.neoforged.net/).

## Language Tools and LSP

Open **Language Tools** from the toolbar or command palette to check for
configured compiler/runtime, formatter/linter, and language-server executables
for Java, TypeScript, Python, HTML, CSS, JSON, Kotlin, C#, C/C++, Rust, and Go.
The dialog supports per-tool executable path overrides and saves them in local
application settings. Discovery checks paths without launching the programs.
Gradle is also discoverable as the build tool used by generated Minecraft
mod projects. When a supported file is open, Zephra Studio starts the detected
server over stdio and connects it to Monaco for diagnostics, completion, hover,
and go-to-definition. Server command arguments use conventional stdio defaults;
servers are not bundled or downloaded. Server processes run with the current
user's permissions. Formatting and workspace-symbol support are not currently
connected to editor actions.

## Workspace Terminal

Choose **Terminal** to open the system shell in the current workspace folder.
The terminal uses a PTY and xterm.js, with interactive input, terminal control
sequences, and resize support. **Stop** terminates the current shell process;
**Output** switches back to the existing program-run output panel.

## Debugger

Choose **Debug** to launch a locally installed Debug Adapter Protocol server.
Configure its executable, JSON argument array, and DAP launch/attach
configuration; specify breakpoint line numbers for the active file. The panel
supports continue, pause, step-over, step-in, step-out, and basic stack-frame
display. Zephra Studio does not bundle adapters or provide language-specific
launch presets. Adapters and debugged applications run with the current user's
permissions; only use trusted adapters and launch configurations.

## Test Explorer

Choose **Tests** to discover workspace `test`/`test:*` npm scripts, Python
`unittest` directories containing `test*.py`, and Gradle projects. Select a
discovered target to run it and view streamed output; a running process can be
stopped from the panel. Running a target executes its project-defined test
commands with the current user permissions.

## Minecraft crash-log analysis

Open **Minecraft Dev** and choose **Choose Log to Analyze…** to select a local
crash report or `latest.log` of up to 2 MB. Analysis runs locally and flags
common Java memory/runtime, missing dependency/class, mixin, duplicate
registration, and tick-loop signatures with line numbers and next-step hints.
It is heuristic guidance, not a definitive diagnosis; logs are not uploaded.

## Git Source Control

Open **Source Control** to inspect changed files in the current Git repository.
The panel can stage or unstage individual files and create commits from staged
changes. It can create and switch local branches, fetch configured remotes,
fast-forward pull, and push the current branch. Commit messages are required.
Switching branches and pulling are blocked while the worktree has changes to
protect unsaved repository state. Pulls do not create merge commits; divergent
branches require manual resolution in Terminal. Configure new remotes through
Terminal with `git remote add`.

## Workspace Snapshots

Choose **Snapshots** to save a named checkpoint of the currently open editor
tabs, including unsaved text. Snapshots are local to the workspace, limited to
5 per workspace across the 10 most recently used workspaces, 20 MB each, and
100 MB total. Restoring one replaces the current open tabs after confirmation
and restores text as editor buffers; it does not write to project files.
Missing snapshot files are skipped with a message. Snapshots contain editor
tabs only and are not Git commits.

**Snapshot Project** creates a compressed full-source snapshot outside the
workspace. Each archive is limited to 50 MB compressed and 50 MB of source,
20,000 files, and 64 folder levels; storage is capped at five snapshots per
workspace, ten workspaces, and 250 MB total. Restore writes into a newly named
folder and refuses to overwrite an existing destination. Common dependency,
VCS, build, cache, and coverage directories are skipped; symbolic links are
skipped rather than followed. This is a bounded project-source backup, not a
bit-for-bit disk image.

## VS Code-Compatible Contributions

Choose **VS Code Contributions** to install local `.vsix` packages. Zephra
Studio reads theme JSON and language-specific snippet contributions; VS Code
theme token colors can be activated in Monaco and snippets appear as editor
completion items for the current session. VSIX archives are inspected without
extracting files or executing extension code. Arbitrary extension activation,
commands, webviews, tasks, settings, and the VS Code extension API are not
implemented. Configure LSP servers and DAP adapters separately in Language
Tools and Debug.

---

## 🧩 Zephra Studio Add-ons

Add-ons use Zephra Code source files with the `.zph` extension. The included
[`addons/hello.zph`](./addons/hello.zph) example is both a runnable Zephra
program and an editor add-on.

To install an add-on, open **Add-ons → Install .zph Add-on**, select a `.zph`
file, then choose **Load** to register its editor commands. Loading and running
ask for confirmation. Add-ons run in a separate Python worker using a
restricted Zephra interpreter: file I/O, imports, plugins, and system access
are not exposed; execution steps, runtime duration, source size, and output
are bounded. This is defense-in-depth, not a hard operating-system security
boundary; do not run add-ons you do not trust. Installed files are stored in
the application user-data `addons` folder; **Open Add-ons Folder** opens it.

An add-on registers editor commands with `studio_command`:

```zephra
studio_command("hello.greet", "Show a greeting", "notify", "Hello from Zephra!");
studio_command("hello.insert", "Insert a comment", "insert_text", "// Generated by my add-on");
```

The supported actions are `notify` (write a message to Output),
`insert_text` (insert text at the editor selection), and `run_current_file`
(run the active file). IDs must be unique within each add-on. Add-on source executes in the restricted worker when loaded or run. IDs may contain
letters, numbers, `.`, `_`, and `-` (up to 80 characters); labels are limited
to 100 characters, values to 10,000 characters, and each add-on to 100
commands. The source and captured load output are each limited to 1 MB, and
loading times out after 15 seconds. These limits reduce accidental resource
use; they are not a security sandbox.

To make your own, create a `.zph` file, add one or more `studio_command` calls,
and optionally add a `main` function for behavior when the file is run directly:

```zephra
studio_command("tools.insert-date", "Insert a date label", "insert_text", "// Date: ");

func main() {
  print("My Zephra add-on is running.");
}

main();
```

Load the file from the Add-ons dialog to use its commands in
**Ctrl+Shift+P**. You can also place source files in the bundled `addons/`
folder while developing Zephra Studio.

---

## 🧰 Recommended Editor Shortcuts

- Open command palette: **Ctrl+Shift+P**
- Search in files: **Ctrl+Shift+F**
- Save file: **Ctrl+S**
- Run file: **Ctrl+R**

---

## 🧩 How it Works (Overview)

- **Electron Main (`app/main.js`)**: handles the native window, file-system operations, running processes, add-on installation, and IPC.
- **Preload (`app/preload.js`)**: exposes a safe API to the renderer.
- **Renderer (`src/`)**: React application using Monaco for editing.
- **Zephra runtime (`zephra/`)**: The actual language implementation used by the IDE.

## Implementation roadmap

This is an incremental roadmap, not a claim that the v1.0 acceptance criteria
are already met:

1. **Audit and stabilize — Verified baseline.** Existing behavior and gaps are
   documented; Python/runtime and Minecraft template regression tests run with
   `npm test`; renderer and Electron type checks pass.
2. **Shell and workspace — Core implemented; ongoing.** Preserve the editor,
   file explorer, search, output, and add-ons while improving layout and
   reliability. Workspace/editor sessions persist, unsaved buffers recover
   without overwriting project files, active files are highlighted, and
   expanded folders refresh on filesystem changes.
3. **Language services and debugging — Protocol clients implemented.** The
   stdio LSP client connects configured language servers for diagnostics,
   completion, hover, and definition. A generic DAP client supports launch,
   breakpoints, stack frames, and stepping when a compatible adapter is
   installed. Language-specific server installation, debug presets, and
   formatting remain future work.
4. **Terminal, Git, and recovery — Core implemented.** The workspace terminal
   uses a PTY with terminal emulation and resize support; the original
   run-output panel remains available separately. Git status, stage/unstage,
   commits, branch creation/switching, and configured remote fetch,
   fast-forward pull, and push are available. Manual editor snapshots preserve
   open-tab contents and can be restored without writing to project files.
   Full-project source snapshots can be restored to a new folder.
   Test Explorer discovers and runs supported npm, Python unittest, and Gradle
   test targets.
5. **Minecraft development — Core project generation implemented.**
   Resource/data pack generation and read-only validation cover the listed
   pack versions. Starter mod projects are generated for Fabric and Forge on
   1.20.1 and 1.21.1, and NeoForge on 1.21.1. NeoForge 1.20.1 is not an
   official target. Newly generated projects can be built from Minecraft Dev
   with streamed output; development-client and arbitrary project tasks remain
   terminal workflows. Pack validation and heuristic crash-log analysis are
   available; richer resource diagnostics remain future work.
6. **Extension platform — Partial and capability-limited.** `.zph` add-ons
   execute in a restricted worker with file/import/system capabilities disabled
   and resource limits, but this is not a hard OS sandbox. Local VSIX theme and
   snippet contributions are supported without executing extension code; the
   general VS Code activation API and extension marketplace are unsupported.
7. **Release validation — In progress.** Windows packaging and automated
   checks are exercised; fresh-install and broader integration testing remain.

Run automated checks with:

```bash
npm test
npx tsc --noEmit
npx tsc -p tsconfig.electron.json --noEmit
npm run build
```

Workspace sessions are stored locally in Zephra Studio's application settings.
Open files and the active tab are restored on startup; unsaved buffers are
recovered as dirty editor tabs and must be saved explicitly. Recovery data is
limited to 20 MB across up to 50 open tabs. Missing files are skipped with a
message in the output panel.

## Known limitations

- Running Zephra requires Python to be installed and available on the system
  PATH, or configured in Zephra Lab.
- Language servers and DAP adapters are not bundled. LSP integration currently
  connects diagnostics, completion, hover, and definition; DAP supports generic
  launch, breakpoint, stack, and stepping workflows but has no language-
  specific setup wizard.
- `.zph` add-on restrictions are enforced by the Zephra interpreter in a
  separate worker, not by a hard OS security boundary. Do not load untrusted
  add-ons.
- VSIX integration supports themes and snippets only. Arbitrary VS Code
  extension code and APIs, webviews, tasks, and marketplace installation are
  not supported.
