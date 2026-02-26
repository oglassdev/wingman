## Context

Wingman is a skeleton Electrobun desktop application (Bun main process + React/Vite client) with no AI integration and no editor extensions. The goal is to build the MVP: a working inline-completion experience in VS Code, IntelliJ, and Zed, backed by a local Electrobun control panel that can receive a line reference and write generated code back to the editor.

The monorepo uses Turborepo. Extensions will live in a new top-level `extensions/` directory. Shared utilities (prompt construction, protocol types) will live in `packages/shared/`.

## Goals / Non-Goals

**Goals:**
- Inline ghost-text completions in VS Code, IntelliJ, and Zed triggered by the user's cursor position
- A "Open Wingman" command in each editor that launches the Electrobun UI with `--file`, `--line`, and `--selection` context
- Electrobun UI: settings panel (API key, model, temperature) + code generation panel that renders streaming output and can write the result back to the file at the specified line
- A stateful Bun HTTP server embedded in the Electrobun main process that owns all AI state, configuration, and prompt construction — editor extensions are thin HTTP clients
- The server uses `@mariozechner/pi-agent-core` as its inference engine, enabling multi-provider LLM support, tool execution, and event streaming out of the box
- IPC/HTTP protocol between extensions and the Electrobun app

**Non-Goals:**
- Multi-file refactors or agentic tool-use loops (MVP — but the agent is ready for it)
- Chat history or multi-turn conversations in the UI (MVP is single-shot)
- Building or distributing the extensions to marketplaces (dev-install only for MVP)
- Authentication / user accounts
- Windows or Linux support (Mac-first for MVP)

## Decisions

### Decision 1: The server owns all state — extensions are thin HTTP clients

**Choice**: The Bun HTTP server maintains all AI-relevant state: the current editor context (`file`, `line`, `selection`, surrounding code), the active `Agent` instance, model configuration, and settings. Editor extensions do **not** construct prompts or manage tokens — they call thin, purpose-built endpoints:

| Endpoint | Who calls it | What it does |
|---|---|---|
| `POST /context` | Any extension | Update the server's knowledge of file/line/selection/surrounding-code |
| `GET /inline` | Extension's inline completion provider | Server constructs FIM prompt from stored context, runs agent, streams SSE tokens back |
| `POST /generate` | UI or extension | Server runs a free-form generation prompt against stored context, streams SSE |
| `POST /writeback` | UI | Store a code result for the extension to pick up |
| `GET /writeback?file=` | Extension | Poll for a pending write-back result |
| `POST /abort` | UI or extension | Abort the current agent run |
| `GET /health` | Extensions on startup | Returns `{ ok, port, model }` |
| `POST /reload-config` | Main process after settings save | Applies new settings to the running Agent |

**Alternatives considered**:
- *Client-constructs-prompt (original design)*: Extensions must know about token budgets, FIM format, model-specific prompt templates, and streaming SSE parsing. Any prompt change requires updating three extension codebases in three languages.
- *WebSockets for streaming*: More setup; SSE from the server is sufficient for one-way token streaming and is callable from Kotlin/Rust without special libraries.

**Rationale**: Centralizing all intelligence on the server means every extension gets smarter for free when the server improves. Prompt engineering, context windowing, and model-specific tuning live in one TypeScript file. Extensions only need to know how to make HTTP requests and render ghost text.

---

### Decision 2: Use `@mariozechner/pi-agent-core` as the inference engine

**Choice**: The Bun server instantiates a single `Agent` from `@mariozechner/pi-agent-core` (npm: `@mariozechner/pi-agent-core`). All LLM calls flow through the agent's `prompt()` / `continue()` interface. SSE streams to clients are built by subscribing to the agent's event emitter and forwarding `message_update` events.

**Why pi-agent over raw fetch-to-OpenAI**:

| Concern | Raw fetch | pi-agent |
|---|---|---|
| Multi-provider (Anthropic, OpenAI, Ollama) | Manual per-provider adapter | Built-in via `getModel()` |
| Streaming | Manual SSE parse + forward | `message_update` event with `delta` |
| Abort / cancel | `AbortController` wired manually | `agent.abort()` |
| Tool calling (future) | Full reimplementation needed | `AgentTool[]` on the Agent |
| Steering mid-generation | Not possible | `agent.steer()` |
| Context pruning | Manual | `transformContext` hook |
| Retry on error | Manual | `agent.continue()` after error |

**Provider support**: `@mariozechner/pi-ai` (peer dep of pi-agent) supports Anthropic, OpenAI, Google Gemini, and any OpenAI-compatible endpoint (covers Ollama). For MVP the user configures one provider/model in settings; the server calls `getModel(provider, modelId)` and passes it to the Agent.

**Agent lifecycle**: One `Agent` instance is created per session context update. On `POST /context`, the server resets the agent's messages (`agent.clearMessages()`) and updates the system prompt with the new file/line/selection context. On `GET /inline` or `POST /generate`, it calls `agent.prompt(...)` and pipes events to the SSE response.

**Alternatives considered**:
- *LangChain.js*: Far heavier, slower startup in Bun, API is unstable between versions.
- *Vercel AI SDK*: Great for Next.js; less natural in a raw Bun server; doesn't give us the steering/tool architecture we'll want for future features.
- *Direct OpenAI SDK*: Would need a parallel Anthropic SDK, manual streaming, no tool execution framework.

---

### Decision 3: Communication between editor extension and Electrobun UI — CLI launch + local HTTP

**Choice**: Each editor extension launches the Electrobun app as a subprocess with CLI arguments (`--file <path> --line <n> --selection "<text>"`). Once running, the app exposes the Bun HTTP server on a fixed port (default `7891`). Extensions discover the port from `$TMPDIR/wingman.port` and call the server's thin endpoints.

**Rationale**: CLI launch is the lowest common denominator across all three extension environments. A local HTTP server is callable from TypeScript, Kotlin, and Rust without special IPC libraries.

---

### Decision 4: Electrobun window mode — floating panel, launched on demand

**Choice**: The Electrobun app runs as a small floating panel (640×480) rather than a full-window app. It's launched by the editor extension command and stays running in the background (system tray / menu bar icon) to avoid cold-start latency on subsequent uses.

**Rationale**: A floating panel feels native to the "quick assistant" UX. Keeping it running avoids the ~1-2s Bun startup cost on every invocation. The running Bun server also means the `Agent` instance and its message history stay warm between uses.

---

### Decision 5: Settings persistence — Bun file system, JSON in app data dir

**Choice**: Settings (provider, API key, model ID, temperature) are stored as a JSON file in the OS app data directory, read/written by the Bun main process, and exposed to the React UI via Electrobun IPC. On save, the main process calls `POST /reload-config` on the Bun server, which calls `agent.setModel(getModel(...))` with the new values.

**Rationale**: Simple, no database dependency, survives app restarts. The pi-agent's `setModel()` / `setSystemPrompt()` methods make live reconfiguration trivial.

## Risks / Trade-offs

- **Cold-start latency** → Mitigation: Keep the Electrobun process running after first launch; hide to tray on close. The `Agent` instance stays warm.
- **Port conflict on `7891`** → Mitigation: Fall back to a random port and write the chosen port to `$TMPDIR/wingman.port` for extensions to discover.
- **Inline completions are slow (LLM latency)** → Mitigation: Extensions debounce 300ms locally before hitting `/inline`; the agent streams tokens immediately so first-token latency feels fast; extensions abort the SSE stream on new keystrokes.
- **Single Agent instance for concurrent requests** → Mitigation: For MVP, inline and generate share one agent and we serialise requests (reject concurrent calls with 409). Post-MVP, spawn per-request agents using the low-level `agentLoop` API.
- **IntelliJ plugin sandboxing** → Mitigation: IntelliJ allows outbound HTTP; OkHttp (bundled with the IntelliJ platform) handles SSE. No native binaries required.
- **Zed extension API maturity** → Mitigation: Scope Zed to slash-command + `POST /generate` for MVP, skip ghost-text if the Zed API doesn't support it yet.
- **API key stored in plain JSON** → Mitigation: Documented limitation; OS keychain integration is post-MVP.
- **pi-agent / pi-ai package availability** → Mitigation: Both are published to npm under the `@mariozechner` scope. Pin to a known-good version; vendor if the package becomes unavailable.

## Migration Plan

1. No existing users or data to migrate.
2. Deploy order: Bun server (with pi-agent) → VS Code extension → UI → IntelliJ plugin → Zed extension.
3. Rollback: disable extensions; the Electrobun app is standalone and can be killed.

## Open Questions

- Should inline ghost-text completions be opt-in (off by default, toggled in settings) to avoid API costs? Likely yes.
- Confirm `@mariozechner/pi-ai` supports Ollama via its OpenAI-compatible adapter — needs a quick spike.
- Should the UI support multiple simultaneous file/line contexts (tabs), or strictly one at a time for MVP?
- For `GET /inline`, should the server wait for the full completion before responding, or stream SSE tokens and let the extension render incrementally? (SSE streaming is preferred but requires SSE parsing in all three extension languages — confirm feasibility for IntelliJ/Kotlin.)
