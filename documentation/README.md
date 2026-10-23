# Zephra Studio Documentation

This is the user and add-on author guide for Zephra Studio. It describes the
features available in the current application, how to use them, how to create
`.zph` add-ons, and the project's development/build workflow.

For the short project overview, see the [repository README](../README.md).
Feature availability and limits may change between releases; this guide
describes the implementation in this repository.

## Contents

- [What Zephra Studio is](#what-zephra-studio-is)
- [Install and run the application](#install-and-run-the-application)
- [Use the editor](#use-the-editor)
- [Panels, layout, and appearance](#panels-layout-and-appearance)
- [Run code and use the terminal](#run-code-and-use-the-terminal)
- [Language tools and debugging](#language-tools-and-debugging)
- [Testing and source control](#testing-and-source-control)
- [Snapshots and recovery](#snapshots-and-recovery)
- [Minecraft development](#minecraft-development)
- [VS Code-compatible contributions](#vs-code-compatible-contributions)
- [Zephra Studio add-ons](#zephra-studio-add-ons)
- [Development, validation, and packaging](#development-validation-and-packaging)
- [Security and limitations](#security-and-limitations)
- [Troubleshooting](#troubleshooting)

## What Zephra Studio is

Zephra Studio is a Windows-first desktop IDE built with Electron, React,
TypeScript, and Monaco Editor. It provides a file explorer, editor, workspace
terminal, output, common programming tools, and Minecraft project helpers.
The built-in Zephra runtime is implemented in Python and can run `.zph` source
files.

The application is split into:

| Area                  | Location           | Responsibility                                                     |
| --------------------- | ------------------ | ------------------------------------------------------------------ |
| Electron main process | `app/`             | Native window, settings, file and process operations, IPC handlers |
| Preload bridge        | `app/preload.js`   | Exposes the limited `zephraStudio` API to the renderer             |
| Renderer              | `src/`             | React interface, Monaco editor, panels and dialogs                 |
| Zephra runtime        | `zephra/`          | Lexer, parser, evaluator and CLI                                   |
| Bundled sample add-on | `addons/hello.zph` | Example `.zph` add-on source                                       |
| Automated tests       | `tests/`           | Python and Node.js regression tests                                |

LSP servers, debug adapters, Git, Java/Gradle, Minecraft loaders, and other
external tools are not bundled unless stated below. Zephra Studio invokes
external processes with the current user's permissions.

## Install and run the application

### Install from the Windows installer

Run the `Zephra Studio Setup <version>.exe` installer and follow its prompts.
The installer is x64 Windows. To create a fresh installer from this source
repository, follow [Development, validation, and packaging](#development-validation-and-packaging).

### Start a workspace

1. Choose **File → Open Folder** or the **Open Folder** action.
2. Select a project folder. The Explorer shows its files and directories.
3. Select a file to open it in the editor. Open files appear in tabs.
4. Choose **File → New File** to create a file inside the workspace.

Workspace folders and editor state are local to this application. Recovered
unsaved tabs are restored as dirty editor buffers; review and save them
explicitly to write changes back to files.

### Keyboard shortcuts

| Shortcut       | Action                         |
| -------------- | ------------------------------ |
| `Ctrl+Shift+P` | Focus/open the command palette |
| `Ctrl+Shift+F` | Search the current workspace   |
| `Ctrl+S`       | Save the active file           |
| `Ctrl+R`       | Run the active file            |

The command palette is the centered search field at the top of the window.
Type to filter available actions and press `Enter` to run the first result.

## Use the editor

The editor is powered by Monaco and supports multiple tabs, syntax
highlighting for supported languages, normal text editing, and selection-based
add-on text insertion. Zephra files use `.zph`. Other syntax modes include
JavaScript/TypeScript, Java, Gradle/Groovy, Kotlin, Python, C++, HTML, CSS,
JSON, and Markdown.

The Explorer supports creating files, renaming files, deleting files, and
expanding/collapsing folders. Deleting a file or folder is destructive; confirm
the prompt carefully. The Explorer refreshes expanded folders when filesystem
changes are observed.

The application supports automatic saving and manual saving. Unsaved buffers
are included in workspace-session recovery and editor snapshots, but neither
recovery nor a snapshot is a substitute for saving a project file.

## Panels, layout, and appearance

- The left activity rail switches the left dock between **Explorer** and
  **Gradle**.
- The right dock switches between **Output** and **Terminal**.
- Drag the dividers to resize the left dock, editor, and right dock.
- Drag toolbar actions to change their placement/order.
- Use **Customize** to choose the Midnight or Daylight theme, an accent color,
  and which panels are shown.
- Panel selections, sizes, theme, accent, and toolbar order are saved in local
  application settings where applicable.

The command palette is positioned in the title/top area. File operations
including **New File** are under **File**, rather than in the Explorer header.

## Run code and use the terminal

### Run the active file

Use **Run** or `Ctrl+R`. Zephra Studio selects a runtime based on the file
language. Running Zephra source invokes the bundled runtime through Python:

```text
python -m zephra path/to/file.zph
```

Install Python and make it available on `PATH`, or set its executable path in
**Zephra Lab**. Program output and runtime errors appear in **Output**.

### Workspace terminal

Choose **Terminal** to open an interactive system shell in the active workspace
folder. It uses a pseudo-terminal (PTY) and xterm.js, so interactive programs,
terminal control sequences, input, and resizing are supported. Use **Stop** to
terminate the current shell process. The **Output** dock is separate and
continues to show program-run output.

The terminal and programs started through it have the current user's
permissions. Be cautious when running scripts or commands from untrusted
projects.

## Language tools and debugging

### Language Tools and LSP

Open **Language Tools** from the toolbar or command palette to discover
installed runtimes, compilers, formatters/linters, and language servers for
Java, TypeScript, Python, HTML, CSS, JSON, Kotlin, C#, C/C++, Rust, and Go.
Executable paths can be overridden in the dialog and are saved locally.
Discovery checks configured paths; it does not install tools.

When a supported file is open, a detected and configured language server can
be started over stdio and connected to Monaco for:

- Diagnostics
- Completion
- Hover information
- Go to definition

Language servers are not bundled or automatically downloaded. Server command
arguments use conventional stdio defaults. Servers run with the current user's
permissions. Formatting and workspace-symbol actions are not currently wired
to the editor.

### Debugger

Open **Debug** to connect to a locally installed Debug Adapter Protocol (DAP)
server. Configure the adapter executable, its JSON argument list, and a DAP
launch or attach configuration. Breakpoints can be specified by line number
for the active file. The debugger supports continue, pause, step-over,
step-in, step-out, and basic stack-frame display.

Zephra Studio does not bundle adapters or provide language-specific debug
presets. Use only trusted adapters and configurations; they run with your
account's permissions.

## Testing and source control

### Test Explorer

Open **Tests** to discover and run:

- npm scripts named `test` or `test:*`
- Python `unittest` directories containing `test*.py`
- Gradle test projects

Select a discovered target to run it and view streamed output. Stop a running
test from the panel. Test commands are defined by the project and run with the
current user's permissions.

### Git Source Control

Open **Source Control** in a Git workspace to inspect changed files and stage
or unstage individual paths. The panel can commit staged changes, create and
switch local branches, fetch configured remotes, fast-forward pull, and push
the current branch.

Commit messages are required. Branch switching and pulling are blocked when
the worktree has changes. Pulls are fast-forward-only; resolve divergent
branches manually in Terminal. Add remotes through Terminal, for example:

```sh
git remote add origin <repository-url>
```

## Snapshots and recovery

### Editor snapshots

**Snapshots** can save a named checkpoint of the currently open tabs, including
unsaved text. Restoring one replaces the current open tabs after confirmation
and restores content as editor buffers; it does not write files to disk.
Missing files are skipped with a message. These snapshots are not Git commits.

Limits: 5 snapshots per workspace, across 10 recently used workspaces; 20 MB
per snapshot and 100 MB aggregate.

### Full-project snapshots

**Snapshot Project** creates a compressed source snapshot outside the
workspace. Restore places it in a newly named folder and refuses to overwrite
an existing destination. Common dependency, version-control, build, cache, and
coverage directories are skipped. Symbolic links are skipped rather than
followed.

Limits: 50 MB compressed and 50 MB source per archive, 20,000 files, 64 folder
levels, 5 snapshots per workspace, 10 workspaces, and 250 MB aggregate. This
is a bounded source backup, not a bit-for-bit disk image.

### Session recovery

The application stores the workspace, open tabs, active tab, and unsaved
buffers in local application settings. Recovery is capped at 20 MB across up
to 50 tabs. Unsaved content returns as dirty buffers; save it explicitly to
update project files. Missing files are skipped with a message.

## Minecraft development

Open **Minecraft Dev** from the toolbar or command palette to create a starter
mod, resource pack, or data pack. The wizard can also validate a resource/data
pack and analyze a local crash log.

### Supported template matrix

| Minecraft version | Resource/data packs | Fabric mod | Forge mod | NeoForge mod | Java           |
| ----------------- | ------------------- | ---------- | --------- | ------------ | -------------- |
| 1.20.1            | Yes                 | Yes        | Yes       | No           | 17             |
| 1.21.1            | Yes                 | Yes        | Yes       | Yes          | 21             |
| 1.21.4            | Yes                 | No         | No        | No           | Not applicable |

NeoForge 1.20.1 is excluded because it is not an official target in these
templates. Pack templates support 1.20.1, 1.21.1, and 1.21.4. Mod projects
include a starter Java entry point, loader metadata, and pinned Gradle
dependencies; they are a starting point, not a complete mod-authoring
framework.

Install a 64-bit JDK for the target Minecraft version and stable Gradle 8.14.3.
Generated projects currently do not include the Gradle wrapper. ForgeGradle
does not currently support Gradle 9.

### Build and launch a mod

Open the project's Gradle panel and double-click a task. **Refresh tasks**
runs `tasks --all` through the detected project wrapper, or system Gradle if
there is no wrapper. Common tasks include:

| Task            | Purpose                                                  |
| --------------- | -------------------------------------------------------- |
| `build`         | Build and check the project                              |
| `clean`         | Remove generated build files                             |
| `test`          | Run project tests                                        |
| `runClient`     | Start the loader's development client                    |
| `runClientAuth` | Start an authenticated development client, if configured |
| `runServer`     | Start a modded development server, if configured         |

First launch can download Minecraft and loader dependencies. Generated mod
projects include authenticated client configuration for the supported loader
templates. On first `runClientAuth`, follow the Microsoft device-code
instructions shown in Gradle output and use the displayed Microsoft sign-in
page. Zephra Studio does not handle your password.

**Credential storage warning:** The DevLogin dependency saves access and
refresh tokens unencrypted in `~/.devlogin`, outside the project. Delete this
directory to remove the local saved login. Do not use authenticated runs on a
shared or untrusted computer.

For an existing NeoForge project, put the following in
`neoForge { runs { ... } }` and refresh Gradle tasks:

```groovy
clientAuth {
    client()
    devLogin = true
}
```

For existing Fabric or Forge projects, follow the loader-specific
[Fabric Loom setup](https://github.com/covers1624/DevLogin/wiki/Fabric%E2%80%90Loom)
or [ForgeGradle setup](https://github.com/covers1624/DevLogin/wiki/ForgeGradle).
See the [NeoForge authenticated account documentation](https://github.com/neoforged/ModDevGradle#using-authenticated-minecraft-accounts)
for details.

The Minecraft Dev dialog's **Build Mod** action runs a build for a newly
generated project. For an existing project, use Gradle panel or Terminal.
Gradle and Java must be installed separately and available to Zephra Studio.

### Pack validation and crash analysis

Pack validation is read-only. It checks `pack.mcmeta`, target pack format,
JSON syntax, namespace folder names, and version-specific data-function
paths.

Crash analysis accepts a local crash report or `latest.log` up to 2 MB. It
looks for common Java memory/runtime, missing dependency/class, mixin,
duplicate-registration, and tick-loop signatures. Results are heuristic
guidance, not a definitive diagnosis; logs are analyzed locally and are not
uploaded.

## VS Code-compatible contributions

Open **VS Code Contributions** to install a local `.vsix` package. Zephra
Studio reads theme JSON and language-specific snippet contributions. Themes
can be activated in Monaco and snippets appear as editor completion items for
the current session.

VSIX packages are inspected without extracting files or executing extension
code. Arbitrary VS Code activation, commands, webviews, tasks, settings, the
extension API, and marketplace installation are not supported. Configure
language servers and debug adapters separately using **Language Tools** and
**Debug**.

## Zephra Studio add-ons

Zephra Studio add-ons are Zephra Code source files with the `.zph` extension.
An add-on is a single source file; it does not use a JSON manifest, package
folder, or JavaScript extension API. The bundled
[hello.zph example](../addons/hello.zph) demonstrates command registration
and normal Zephra code.

### Add-on file layout

A simple add-on can have this layout:

```text
hello-tools.zph
```

The file typically contains:

1. Optional comments describing the add-on.
2. Optional `studio_permission(...)` declarations.
3. Optional `studio_view(...)` declarations.
4. One or more `studio_command(...)` declarations at top level.
5. Optional functions and ordinary Zephra statements.
6. Optional calls that run the add-on's own logic when it is loaded or run.

There is no install-time build step. Use the `.zph` extension and valid Zephra
syntax. Keep all code in the selected file. Imports and direct filesystem
operations remain disabled in the restricted runtime; workspace files are
available only through the mediated APIs listed below and only after the
specific permission is approved.

### Creating an add-on

1. Create a new `.zph` file in the editor or another text editor.
2. Add unique command IDs and labels; optionally declare permissions and views.
3. Save the file.
4. Open **Add-ons** → **Install .zph Add-on** and choose the file. Or copy it
   into the add-ons directory opened by **Open Add-ons Folder**.
5. Choose **Load** to execute it in the restricted runtime and register its
   commands. Zephra Studio asks for confirmation first and separately asks
   before granting any requested capabilities.
6. Press `Ctrl+Shift+P`, search for the command label, and select it.

The bundled `addons/hello.zph` can also be loaded as an example. The user
add-ons folder is under Zephra Studio's application user-data directory.
Installed add-ons are copied there; the bundled `addons/` directory is also
scanned. Loading and **Run** execute the selected file in the restricted
runtime and ask for confirmation.

### Add-on example

```zephra
// hello-tools.zph
// Register commands that appear in Zephra Studio's command palette.

studio_command(
  "hello.greet",
  "Show a greeting",
  "notify",
  "Hello from my Zephra Studio add-on!"
);

studio_command(
  "hello.insert-comment",
  "Insert a comment",
  "insert_text",
  "// Added by my add-on"
);

studio_command(
  "hello.run-file",
  "Run the active file",
  "run_current_file",
  ""
);

studio_permission("workspace.read");
studio_permission("ui.notify");

studio_view(
  "readme-view",
  "Workspace README",
  "<main><h1>Workspace README</h1><button id=\"read\">Read README.md</button><pre id=\"output\"></pre><script>
let requestId = 0;
window.addEventListener(\"message\", event => {
  if (event.data?.channel !== \"zephra-studio-host\") return;
  document.querySelector(\"#output\").textContent =
    event.data.error || event.data.result || \"(empty)\";
});
document.querySelector(\"#read\").addEventListener(\"click\", () => {
  parent.postMessage({
    channel: \"zephra-studio-addon\",
    id: String(++requestId),
    method: \"workspace.readFile\",
    path: \"README.md\"
  }, \"*\");
});
</script></main>"
);

func main() {
  print("Hello from Zephra Code!");
}

main();
```

`studio_command` registers a command; it does not execute the selected action
while the add-on is loading. A top-level `main();` call is ordinary Zephra
program logic and runs when the file is loaded or run. Its printed output is
shown by the add-on manager or Output panel.

### `studio_command` API

Call the built-in with exactly four string arguments:

```zephra
studio_command(command_id, label, action, value);
```

| Argument     | Meaning                            | Constraints                                                                                                    |
| ------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `command_id` | Stable identifier for the command  | 1–80 characters; letters, numbers, `.`, `_`, `-`; must start with a letter or number; unique within the add-on |
| `label`      | Text shown in the command palette  | Non-empty; at most 100 characters                                                                              |
| `action`     | One of the supported actions below | Must match exactly                                                                                             |
| `value`      | Action payload                     | String of at most 10,000 characters                                                                            |

Each add-on can register up to 100 commands. The host validates command
shapes, IDs, labels, supported action values, duplicate IDs, and size limits.
The loaded command list is registered for the current application session.
Reloading an add-on re-executes it and refreshes its commands.

Supported actions:

| Action             | Behavior                                                               | Use of `value`                                                              |
| ------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `notify`           | Writes the value to the Output panel as a message                      | Displayed as output text                                                    |
| `insert_text`      | Replaces the current editor selection with text and focuses the editor | Inserted verbatim at the selection; an open editor and selection are needed |
| `run_current_file` | Runs the active editor file using Zephra Studio's normal run-file flow | Ignored; pass an empty string                                               |

These are the only add-on command actions. Add-ons cannot define arbitrary
JavaScript callbacks, UI panels, menu contributions, background services, or
new host API calls.

`studio_view(view_id, label, html)` registers an isolated custom interface and
automatically creates an **Open <label>** command. Each add-on may register at
most 10 views; IDs follow the same format as command IDs, labels are limited
to 100 characters, and HTML is limited to 100,000 characters.

The view's HTML is rendered inside an iframe with `sandbox="allow-scripts"` and
an opaque origin. Inline HTML, CSS, and JavaScript are permitted, but network
connections, external scripts, parent DOM access, navigation, forms, and
plugins are blocked by the view's Content Security Policy and iframe sandbox.
The only way for the view to call the IDE is the mediated `postMessage` API.

Use this request shape from the view:

```javascript
parent.postMessage(
  {
    channel: "zephra-studio-addon",
    id: "unique-request-id",
    method: "workspace.readFile",
    path: "README.md",
  },
  "*",
);

window.addEventListener("message", (event) => {
  if (event.data?.channel !== "zephra-studio-host") return;
  if (event.data.error) {
    // Display the error returned by the host.
    return;
  }
  // Consume event.data.result.
});
```

Responses contain the matching `id` and either `result` or `error`. The host
accepts messages only from the add-on's own iframe, enforces the permission
grant and request limits, and rejects unknown API methods.

### IDE permissions and API methods

Declare capabilities by calling `studio_permission(permission)` in the `.zph`
file. Zephra Studio displays the requested permissions after running the file
in the restricted interpreter. Approvals are held for the current loaded
add-on session; rejecting a permission leaves the view/commands registered,
but calls requiring that permission return an error. Workspace access is tied
to the workspace open when the add-on was loaded. Reload the add-on after
changing workspaces to request access to the new workspace.

| Permission        | View API method       | Function                                                | Limits                                                                  |
| ----------------- | --------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `workspace.info`  | `workspace.getRoot`   | Returns the path of the approved open workspace         | Only the approved workspace                                             |
| `workspace.read`  | `workspace.readFile`  | Reads a UTF-8 text file using a workspace-relative path | 1 MB per file; symlinks are rejected                                    |
| `workspace.write` | `workspace.writeFile` | Writes UTF-8 text using a workspace-relative path       | 1 MB per file; parent folders must already exist; symlinks are rejected |
| `ui.notify`       | `ui.notify`           | Writes a message to Zephra Studio's Output panel        | 10,000 characters                                                       |

Workspace paths cannot be absolute or traverse outside the workspace. File
read/write does not expose general filesystem access, directory enumeration,
process execution, network access, or arbitrary calls to the renderer's IPC
API. The view bridge is limited to 60 requests per minute. New IDE APIs must
be deliberately added to the permission list and host bridge; add-ons cannot
invoke arbitrary IDE functions.

### Add-on runtime and trust

Add-ons execute as a separate Python process using the restricted Zephra
interpreter mode. The host limits source files to 1 MB, runtime to 15 seconds,
captured output to 1 MB, and registered commands to 100. The interpreter restricts imports, direct file/system built-ins,
object-property access, large values, and execution steps. Workspace file
access and IDE notifications are exposed only through the limited bridge
described above after explicit user approval. Custom views use a sandboxed
iframe with a restrictive content policy.

This is defense in depth, **not a hard operating-system sandbox**. A
vulnerability in the interpreter, its dependencies, or the host process could
undermine these restrictions. The application asks before loading or running
an add-on; read and trust the source before approving it. Do not install
untrusted add-ons. The execution process runs under your user account.

### Sharing and versioning add-ons

An add-on can be shared as its `.zph` source file. Include usage notes in
comments and choose an ID prefix that avoids collisions (for example,
`authorname.tool-name`). There is no signing, dependency resolver, update
service, or automatic compatibility metadata today. Check an add-on against
the Zephra Studio release and its documented API before using it.

## Development, validation, and packaging

### Requirements

- Node.js and npm
- Python for the Zephra runtime and Python tests
- Windows x64 for the packaged installer
- JDK and Gradle only when building/running Minecraft projects

Install JavaScript dependencies from the repository root:

```sh
npm install
```

### Run from source

```sh
npm run dev
```

This starts the Vite renderer and Electron application. To run just the
renderer during UI work, use `npm run dev:vite`.

### Tests and type checks

```sh
npm test
npx tsc --noEmit
npx tsc -p tsconfig.electron.json --noEmit
```

`npm test` runs Python `unittest` discovery in `tests/` and the Node.js test
files. Run the smallest relevant test while iterating, then use the full suite
before release.

### Build a Windows installer

```sh
npm run build
```

This builds the renderer and packages the Electron application with
electron-builder. The x64 Windows installer is written to `dist/`, typically
as `Zephra Studio Setup <version>.exe`. `npm run build:renderer` only creates
the renderer assets and is **not** a complete installer build. The generated
installer and unpacked application are build outputs; do not add them to
source control unless the release process explicitly requests them.

The app icon can be replaced using `build/icon.png` (512×512 recommended) and
`build/icon.ico`, then rebuilt.

### Repository maintenance

- `npm run lint` runs ESLint for TypeScript/TSX sources.
- `npm run format` applies Prettier to supported source files.
- `git diff --check` checks for whitespace errors.
- Add focused regression tests when changing templates, command behavior, or
  runtime limits.

## Security and limitations

- Add-on restrictions are interpreter/process-level defense in depth, not an
  OS sandbox. Do not run untrusted `.zph` code.
- Shells, test commands, language servers, DAP adapters, Gradle, Git, and
  project scripts run with the current user's permissions.
- Microsoft authenticated Minecraft development runs persist DevLogin tokens
  unencrypted in `~/.devlogin`. Do not use them on a shared or untrusted
  computer; delete that folder to remove the saved login.
- VSIX extension code is not executed. Only theme and snippet contributions
  are supported.
- LSP/DAP servers, compilers, runtimes, formatters, JDK, and Gradle are not
  bundled or installed by the IDE.
- LSP support is limited to stdio diagnostics, completion, hover, and
  definition. DAP support is generic and does not include language-specific
  presets.
- Minecraft project generation creates starter projects; it does not generate
  modpacks or server plugins.
- Pack validation and crash-log analysis are bounded, local, and limited to
  the checks/signatures described above.

## Troubleshooting

### A `.zph` file appears in Add-ons but its command is missing

Choose **Load** after installing or copying the file. Loading executes the
file and registers commands for the current application session. Check the
Output panel and add-on dialog for parse or runtime errors. Confirm that
`studio_command` has four strings, a unique valid ID, a supported action, and
is reached during top-level execution.

### An add-on times out or is rejected

Reduce long-running loops and output. Add-on source and output are limited to
1 MB, run time is limited to 15 seconds, and each add-on can register at most
100 commands. Imports and file/system access are unavailable in the restricted
runtime.

### Gradle says a task does not exist

Refresh tasks to query the project. Confirm that the selected folder is the
Gradle project root and that the project defines the requested loader run.
Generated starter projects do not include a wrapper; install stable Gradle
8.14.3 and ensure `gradle` is on `PATH`, or add a project wrapper.

### Minecraft client fails to launch

Check the Gradle output and Java version: templates for 1.20.1 use Java 17;
1.21.1 uses Java 21. Allow the first run to download dependencies. For a
NeoForge template, retain the explicit `client()` run-type selector. Avoid
Gradle 9 with ForgeGradle.

### Microsoft sign-in does not complete

Run `runClientAuth` and follow the current device-code instructions printed by
the loader. Ensure the account owns Minecraft and the device can reach
Microsoft sign-in endpoints. Do not paste passwords or tokens into the IDE,
Gradle command line, project files, or support messages. DevLogin's saved
tokens are in `~/.devlogin`.

### A language server or debugger does not start

Confirm its executable is installed and configured in Language Tools or Debug.
These processes are not bundled. Check the command, arguments, server/adapter
logs, and protocol compatibility; they run under the current user's account.
