## 1. Monorepo & Shared Package Setup

- [ ] 1.1 Create `packages/shared/` with `package.json` (name: `@wingman/shared`) and TypeScript config
- [ ] 1.2 Add prompt-construction utility: `packages/shared/src/prompt.ts` — FIM prompt builder (prefix/suffix truncation to token budget)
- [ ] 1.3 Add protocol types: `packages/shared/src/types.ts` — `CompletionRequest`, `WritebackPayload`, `WingmanContext`
- [ ] 1.4 Add HTTP client helper: `packages/shared/src/client.ts` — `postComplete()` and `getWriteback()` functions targeting a configurable port
- [ ] 1.5 Add `@wingman/shared` to the Turborepo workspace and wire it into `turbo.json`

## 2. AI Inference Bridge (Bun HTTP Server)

- [ ] 2.1 Create `apps/server/src/inference-server.ts` — Bun HTTP server with `POST /complete`, `GET /health`, `POST /writeback`, `GET /writeback`, `POST /reload-config`, `POST /context` endpoints
- [ ] 2.2 Implement port selection logic: try `7891`, fall back to random port, write chosen port to `$TMPDIR/wingman.port`
- [ ] 2.3 Implement streaming SSE for `POST /complete` — proxy to OpenAI-compatible backend using `fetch` with streaming
- [ ] 2.4 Implement in-memory write-back store with get-and-remove semantics
- [ ] 2.5 Implement `POST /reload-config` — re-reads the settings JSON file and applies new LLM config
- [ ] 2.6 Add settings file I/O: `apps/server/src/settings.ts` — read/write `wingman-settings.json` from the OS app data directory
- [ ] 2.7 Start the inference server from `apps/server/src/index.ts` before creating the BrowserWindow

## 3. Electrobun Main Process — Context & IPC

- [ ] 3.1 Parse `--file`, `--line`, `--selection` from `process.argv` in `apps/server/src/index.ts`
- [ ] 3.2 Register Electrobun IPC handler `settings:read` — reads and returns settings from file
- [ ] 3.3 Register Electrobun IPC handler `settings:write` — writes settings to file and calls `POST /reload-config` on the inference bridge
- [ ] 3.4 Implement "already running" guard: on second launch, call `POST /context` on the running inference server instead of starting a new window
- [ ] 3.5 Register IPC handler on inference bridge `POST /context` to forward context to the React UI via Electrobun IPC (`ui:context-update`)
- [ ] 3.6 Update `electrobun.config.ts` window dimensions to 640×480 and set `alwaysOnTop: true`
- [ ] 3.7 Add system tray / menu bar icon: hide window on close, show "Quit Wingman" menu item that calls `process.exit(0)`

## 4. Wingman UI — React Client

- [ ] 4.1 Replace placeholder `apps/client/src/App.tsx` with a two-panel layout: Settings tab and Generate tab
- [ ] 4.2 Create `apps/client/src/context/WingmanContext.tsx` — React context holding `{ file, line, selection }`, populated via Electrobun IPC `ui:context-update` event
- [ ] 4.3 Build `apps/client/src/components/ContextHeader.tsx` — displays active file name and line number from context; shows "No file context" when empty
- [ ] 4.4 Build `apps/client/src/components/SettingsPanel.tsx` — form with fields: backend URL, API key (masked), model name, temperature slider; Save button calls `settings:write` via IPC
- [ ] 4.5 Build `apps/client/src/components/GeneratePanel.tsx` — prompt textarea, Generate button, streaming code block output (using EventSource or fetch streaming), Stop button, Write to Editor button
- [ ] 4.6 Implement streaming fetch in `GeneratePanel` — consume SSE from `POST http://localhost:<port>/complete` and append tokens to code block
- [ ] 4.7 Implement "Write to Editor" in `GeneratePanel` — `POST /writeback` with current context and generated code; show "Sent!" confirmation
- [ ] 4.8 Read inference port from settings (via IPC) and use it for all HTTP calls from the UI

## 5. VS Code Extension

- [ ] 5.1 Create `extensions/vscode/` with `package.json` (publisher, name, `engines.vscode`) and `tsconfig.json`
- [ ] 5.2 Implement `extensions/vscode/src/extension.ts` — activate/deactivate lifecycle, register inline completion provider and "Wingman: Open" command
- [ ] 5.3 Implement inline completion provider — reads port from `$TMPDIR/wingman.port`, calls `POST /complete` with FIM prompt, returns `InlineCompletionList`
- [ ] 5.4 Implement debounce (300ms) and request cancellation in the completion provider using `CancellationToken`
- [ ] 5.5 Implement "Wingman: Open" command — reads active editor state, launches Wingman app subprocess with `--file`, `--line`, `--selection` args (or focuses running instance)
- [ ] 5.6 Implement write-back polling — `GET /writeback?file=<path>` on a 2-second interval; on result, call `vscode.workspace.applyEdit` to insert code at the specified line
- [ ] 5.7 Add `wingman.inferencePort` setting to `package.json` `contributes.configuration`
- [ ] 5.8 Add `launch.json` for running the extension in the VS Code Extension Development Host

## 6. IntelliJ Plugin

- [ ] 6.1 Create `extensions/intellij/` as a Gradle project with `plugin.xml`, `build.gradle.kts`, and Kotlin source structure
- [ ] 6.2 Implement `WingmanInlineCompletionProvider.kt` — registers as an inline completion provider, fetches from `POST /complete` using OkHttp with SSE parsing
- [ ] 6.3 Implement debounce (300ms) using a `ScheduledExecutorService` and cancel previous request on new keystroke
- [ ] 6.4 Implement `OpenWingmanAction.kt` — reads current file/line/selection, launches Wingman via `ProcessBuilder`, or calls `POST /context` if already running
- [ ] 6.5 Implement write-back polling in a background `Task.Backgroundable` — polls `GET /writeback?file=<path>` every 2s, applies result via `WriteCommandAction.runWriteCommandAction`
- [ ] 6.6 Create `WingmanSettingsComponent.kt` and `WingmanSettingsConfigurable.kt` — settings panel under Preferences > Tools > Wingman with port field
- [ ] 6.7 Register all components and actions in `plugin.xml`
- [ ] 6.8 Add Gradle `runIde` task configuration for local development testing

## 7. Zed Extension

- [ ] 7.1 Create `extensions/zed/` as a Rust crate with `Cargo.toml` and `extension.toml` (type: `zed_extension_api`)
- [ ] 7.2 Implement slash command `/wingman` in `src/lib.rs` — calls `POST /complete` via `reqwest` (or `ureq`) and streams the response into the assistant panel
- [ ] 7.3 Implement "wingman: open" command palette action — reads context from Zed's editor API, launches Wingman subprocess
- [ ] 7.4 Implement inline assist provider if `zed_extension_api` exposes the trait; otherwise log a debug message and skip
- [ ] 7.5 Read `inference_port` from Zed extension settings with fallback to port file `$TMPDIR/wingman.port`
- [ ] 7.6 Add `extension.toml` entries for slash commands, actions, and settings schema

## 8. Integration & Polish

- [ ] 8.1 Write a `scripts/install-extensions.sh` that installs the VS Code extension (`code --install-extension`) and opens IntelliJ/Zed extension dirs for manual install
- [ ] 8.2 Add a root-level `README.md` section "Getting Started with Wingman MVP" covering: start Wingman app, install extensions, configure API key in settings
- [ ] 8.3 Manual end-to-end test: open a TypeScript file in VS Code → pause typing → ghost text appears → accept with Tab → run "Wingman: Open" → UI shows context → generate code → click "Write to Editor" → code appears in VS Code
- [ ] 8.4 Manual end-to-end test: same flow in IntelliJ with a Java or Kotlin file
- [ ] 8.5 Verify port fallback: start Wingman twice; second instance should forward context to first instead of binding a new port
- [ ] 8.6 Verify settings persistence: change model and API key → restart app → settings retained
