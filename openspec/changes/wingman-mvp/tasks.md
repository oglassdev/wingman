## 1. Monorepo & Shared Package Setup

- [x] 1.1 Create `packages/shared/` with `package.json` (name: `@wingman/shared`) and TypeScript config
- [x] 1.2 Add protocol types: `packages/shared/src/types.ts` — `WingmanContext`, `WritebackPayload`, `WingmanSettings`, `InferenceServerStatus`
- [x] 1.3 Add port-discovery helper: `packages/shared/src/port.ts` — reads `$TMPDIR/wingman.port` and returns the current server port as a number
- [x] 1.4 Add HTTP client helpers: `packages/shared/src/client.ts` — `postContext()`, `getInline()` (returns an EventSource/fetch stream), `getWriteback()`, `getHealth()` functions
- [x] 1.5 Add `@wingman/shared` to the Turborepo workspace and wire it into `turbo.json`

## 2. Bun Inference Server — pi-agent Core

- [ ] 2.1 Add `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai` to `apps/server/package.json`
- [ ] 2.2 Create `apps/server/src/settings.ts` — read/write `wingman-settings.json` from the OS app data dir; export `loadSettings()` and `saveSettings()`
- [ ] 2.3 Create `apps/server/src/agent.ts` — instantiate the `Agent`, expose `getAgent()`, `resetAgent()`, `reconfigureAgent(settings)` using `agent.setModel()`, `agent.setSystemPrompt()`, `agent.clearMessages()`
- [ ] 2.4 Create `apps/server/src/context.ts` — maintain the current `WingmanContext` state; export `setContext()`, `getContext()`, and `buildSystemPrompt(context)` that returns the full system prompt string with file/line/code context
- [ ] 2.5 Create `apps/server/src/inference-server.ts` — Bun HTTP server with port fallback logic (try 7891 → random → write to `$TMPDIR/wingman.port`)
- [ ] 2.6 Implement `GET /health` — returns `{ ok: true, port, model: agent.state.model?.id ?? null }`
- [ ] 2.7 Implement `POST /context` — calls `setContext()`, rebuilds system prompt via `agent.setSystemPrompt()`, calls `agent.clearMessages()`, returns `{ ok: true }`
- [ ] 2.8 Implement `GET /context` — returns the current `WingmanContext` object (used by UI polling)
- [ ] 2.9 Implement `GET /inline` — builds FIM prompt from stored context, calls `agent.prompt(fimPrompt)`, subscribes to `message_update` events and streams each `delta` as SSE; on request close calls `agent.abort()`
- [ ] 2.10 Implement concurrent-request guard on `/inline` and `/generate` — if agent is streaming, call `agent.abort()` + `agent.waitForIdle()` before starting new run; return HTTP 409 if abort times out after 2s
- [ ] 2.11 Implement `POST /generate` — accepts `{ prompt: string }`, calls `agent.prompt(prompt)`, streams SSE tokens; on connection close calls `agent.abort()`
- [ ] 2.12 Implement `POST /abort` — calls `agent.abort()`, returns `{ ok: true }`
- [ ] 2.13 Implement `POST /writeback` and `GET /writeback` — in-memory store with get-and-remove semantics per file path
- [ ] 2.14 Implement `POST /reload-config` — calls `loadSettings()` and `reconfigureAgent(settings)`
- [ ] 2.15 Start the inference server from `apps/server/src/index.ts` before creating the BrowserWindow

## 3. Electrobun Main Process — Context & IPC

- [ ] 3.1 Parse `--file`, `--line`, `--selection` from `process.argv` in `apps/server/src/index.ts`
- [ ] 3.2 After server starts, if CLI context args are present, call `POST /context` on the local server with parsed values
- [ ] 3.3 Register Electrobun IPC handler `settings:read` — calls `loadSettings()` and returns the settings object to the UI
- [ ] 3.4 Register Electrobun IPC handler `settings:write` — calls `saveSettings()` then `POST /reload-config` on the inference server
- [ ] 3.5 Update `electrobun.config.ts` window dimensions to 640×480 and set `alwaysOnTop: true`
- [ ] 3.6 Add system tray / menu bar icon: hide window on close, show "Quit Wingman" context menu item

## 4. Wingman UI — React Client

- [ ] 4.1 Replace placeholder `apps/client/src/App.tsx` with a two-tab layout: Settings tab and Generate tab
- [ ] 4.2 Create `apps/client/src/hooks/useServerContext.ts` — polls `GET /context` every 2s and returns the current `WingmanContext`
- [ ] 4.3 Create `apps/client/src/hooks/useSettings.ts` — reads settings on mount via `settings:read` IPC; exposes `save(settings)` that calls `settings:write` IPC
- [ ] 4.4 Build `apps/client/src/components/ContextHeader.tsx` — displays file name and line from `useServerContext`; shows "No file context" when null
- [ ] 4.5 Build `apps/client/src/components/SettingsPanel.tsx` — form with fields: provider selector, backend URL, API key (masked), model ID, temperature slider; Save triggers `useSettings.save()`
- [ ] 4.6 Build `apps/client/src/components/GeneratePanel.tsx` — prompt textarea, Generate button, streaming code block, Stop button, Write to Editor button
- [ ] 4.7 Implement streaming in `GeneratePanel` — `fetch` with `ReadableStream` consuming SSE from `POST /generate`; append deltas to code block; Stop calls `POST /abort`
- [ ] 4.8 Implement "Write to Editor" in `GeneratePanel` — `POST /writeback` with `{ file, line, code }` from current context; show "Sent!" confirmation
- [ ] 4.9 Read inference server port from `GET /health` on mount and store in React context for all HTTP calls

## 5. VS Code Extension

- [ ] 5.1 Create `extensions/vscode/` with `package.json` (publisher, name, `engines.vscode`) and `tsconfig.json`
- [ ] 5.2 Implement `extensions/vscode/src/extension.ts` — activate/deactivate lifecycle; register inline completion provider and "Wingman: Open" command
- [ ] 5.3 Implement inline completion provider: on trigger, read 20 lines before + 10 lines after cursor; call `POST /context` with `{ file, line, selection, surroundingCode }`; then open SSE to `GET /inline`; feed tokens into `InlineCompletionItem`
- [ ] 5.4 Implement 300ms debounce in the completion provider; close open SSE connections on new keystrokes using `CancellationToken` and `AbortController`
- [ ] 5.5 Implement "Wingman: Open" command — check `GET /health`; if running call `POST /context`; if not spawn subprocess with `--file --line --selection` args; then bring window to front
- [ ] 5.6 Implement write-back polling — `GET /writeback?file=<path>` on a 2-second interval; on result, use `vscode.workspace.applyEdit` to insert code at the specified line
- [ ] 5.7 Add `wingman.enabled` (bool, default true) and `wingman.inferencePort` (number, default 7891) settings to `package.json` `contributes.configuration`
- [ ] 5.8 Add `launch.json` for running the extension in the VS Code Extension Development Host

## 6. IntelliJ Plugin

- [ ] 6.1 Create `extensions/intellij/` as a Gradle project with `plugin.xml`, `build.gradle.kts`, and Kotlin source structure
- [ ] 6.2 Create `WingmanHttpClient.kt` — OkHttp-based client with `postContext()`, `getInlineStream()` (returns OkHttp `ResponseBody` for SSE reading), `getWriteback()`, `getHealth()`
- [ ] 6.3 Implement `WingmanInlineCompletionProvider.kt` — on trigger, collect surrounding lines, call `postContext()`, then read SSE from `getInlineStream()`, accumulate tokens, return as inline hint
- [ ] 6.4 Implement 300ms debounce via `ScheduledExecutorService`; cancel previous OkHttp call on new keystroke
- [ ] 6.5 Implement `OpenWingmanAction.kt` — calls `getHealth()`; if running calls `postContext()`; if not launches Wingman via `ProcessBuilder` with `--file --line --selection`
- [ ] 6.6 Implement write-back polling in a background `Task.Backgroundable` — polls `getWriteback()` every 2s; on result inserts code via `WriteCommandAction.runWriteCommandAction`
- [ ] 6.7 Create `WingmanSettingsComponent.kt` + `WingmanSettingsConfigurable.kt` — settings page under Preferences > Tools > Wingman (port field, enable toggle)
- [ ] 6.8 Register all components and actions in `plugin.xml`; add Gradle `runIde` task for dev testing

## 7. Zed Extension

- [ ] 7.1 Create `extensions/zed/` as a Rust crate with `Cargo.toml` and `extension.toml`
- [ ] 7.2 Implement slash command `/wingman` in `src/lib.rs` — reads context from Zed's active buffer, calls `POST /context`, then streams `GET /generate` (or `/inline`) into the assistant panel
- [ ] 7.3 Implement "wingman: open" command palette action — reads file/line from Zed buffer, checks `/health`, calls `POST /context` or spawns subprocess
- [ ] 7.4 Implement inline assist provider if `zed_extension_api` exposes the trait; otherwise skip with a debug log
- [ ] 7.5 Read port from Zed extension settings (`wingman.inference_port`) with fallback to `$TMPDIR/wingman.port`
- [ ] 7.6 Add `extension.toml` entries for slash commands, actions, and settings schema

## 8. Integration & Polish

- [ ] 8.1 Write `scripts/install-extensions.sh` — installs VS Code extension via `code --install-extension`, prints instructions for IntelliJ and Zed
- [ ] 8.2 Update root `README.md` with "Getting Started" section: start Wingman app, install extensions, configure provider/model/API key in settings panel
- [ ] 8.3 End-to-end test (VS Code): open a TypeScript file → pause typing → ghost text streams in → Tab to accept → run "Wingman: Open" → UI shows context → submit a generate prompt → "Write to Editor" → code inserted in VS Code
- [ ] 8.4 End-to-end test (IntelliJ): same flow with a Java/Kotlin file
- [ ] 8.5 Verify server-state correctness: open two different files in VS Code, switch between them, confirm `/context` always reflects the active file
- [ ] 8.6 Verify port fallback: start Wingman twice; second invocation should call `POST /context` on the running server, not spawn a second process
- [ ] 8.7 Verify settings persistence and hot-reload: change model → save → send a generate request → confirm new model is used without restarting
