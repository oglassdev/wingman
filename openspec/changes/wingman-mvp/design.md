## Context

Wingman is a skeleton Electrobun desktop application (Bun main process + React/Vite client) with no AI integration and no editor extensions. The goal is to build the MVP: a working inline-completion experience in VS Code, IntelliJ, and Zed, backed by a local Electrobun control panel that can receive a line reference and write generated code back to the editor.

The monorepo uses Turborepo. Extensions will live in a new top-level `extensions/` directory. Shared utilities (prompt construction, protocol types) will live in `packages/shared/`.

## Goals / Non-Goals

**Goals:**
- Inline ghost-text completions in VS Code, IntelliJ, and Zed triggered by the user's cursor position
- A "Open Wingman" command in each editor that launches the Electrobun UI with `--file`, `--line`, and `--selection` context
- Electrobun UI: settings panel (API key, model, temperature) + code generation panel that renders streaming output and can write the result back to the file at the specified line
- A lightweight AI inference HTTP server embedded in the Electrobun main process, compatible with OpenAI's Chat Completions API and Ollama
- IPC/HTTP protocol between extensions and the Electrobun app

**Non-Goals:**
- Multi-file refactors or agentic tool-use loops
- Chat history or multi-turn conversations in the UI (MVP is single-shot)
- Building or distributing the extensions to marketplaces (dev-install only for MVP)
- Authentication / user accounts
- Windows or Linux support (Mac-first for MVP)

## Decisions

### Decision 1: Communication between editor extension and Electrobun UI — local HTTP + CLI launch

**Choice**: Each editor extension launches the Electrobun app as a subprocess with CLI arguments (`--file <path> --line <n> --selection "<text>"`). Once running, the app exposes a local HTTP server on a fixed port (default `7891`). Extensions send context updates and receive write-back events via this HTTP API.

**Alternatives considered**:
- *Named pipes / Unix sockets*: More efficient but significantly harder to implement in all three extension environments (especially IntelliJ's JVM sandbox).
- *VS Code extension as the hub, others call it*: Vendor-specific, would break IntelliJ and Zed.
- *WebSockets*: More complex than needed for MVP; HTTP long-poll is simpler to reason about.

**Rationale**: CLI launch is the lowest common denominator across all three extension environments. A local HTTP server is simple to implement in Bun and to call from any language (TypeScript, Kotlin, Rust).

---

### Decision 2: Inline completions use the same inference HTTP server as the UI

**Choice**: Editor extensions call the same Bun inference HTTP server (`POST /complete`) for both inline ghost-text and the UI's code generation panel. The server streams SSE (Server-Sent Events).

**Alternatives considered**:
- *Extensions call the LLM directly*: Requires each extension to handle API key storage, retry logic, and streaming — duplicated across three environments and languages.
- *Separate completion endpoint*: Unnecessary complexity for MVP.

**Rationale**: Centralizing inference in the Electrobun process means API key management, model config, and retry logic live in one place (the Bun server). Extensions become thin clients.

---

### Decision 3: Extension architecture — one TypeScript shared core, thin wrappers

**Choice**: A `packages/shared/` package provides prompt construction, the HTTP client for calling the inference server, and protocol types. Each extension imports or vendors this. VS Code (TypeScript) imports directly. IntelliJ (Kotlin) has its own HTTP client calling the same server endpoints. Zed (Rust) similarly calls the HTTP server.

**Rationale**: Avoids duplicating prompt logic. IntelliJ and Zed can't use the npm package directly, but they can speak the same HTTP protocol. For MVP, the shared package primarily benefits the VS Code extension; IntelliJ and Zed get simpler but independent implementations.

---

### Decision 4: Electrobun window mode — floating panel, launched on demand

**Choice**: The Electrobun app runs as a small floating panel (640×480) rather than a full-window app. It's launched by the editor extension command and stays running in the background (system tray / menu bar icon) to avoid cold-start latency on subsequent uses.

**Rationale**: A floating panel feels native to the "quick assistant" UX. Keeping it running avoids the ~1-2s Bun startup cost on every invocation.

---

### Decision 5: Settings persistence — Bun's file system, JSON file in app data dir

**Choice**: Settings (API key, model, temperature) are stored as a JSON file in the OS app data directory, read/written by the Bun main process, and exposed to the React UI via Electrobun IPC.

**Rationale**: Simple, no database dependency, survives app restarts. Electrobun's IPC makes it straightforward to expose this to the browser context.

## Risks / Trade-offs

- **Cold-start latency** → Mitigation: Keep the Electrobun process running after first launch; hide to tray on close.
- **Port conflict on `7891`** → Mitigation: Fall back to a random port and write the chosen port to a known temp file that extensions can read.
- **Inline completions are slow (LLM latency)** → Mitigation: Use a short debounce (300ms), cancel in-flight requests on new keystrokes, and prefer streaming so the first tokens appear fast.
- **IntelliJ plugin sandboxing** → Mitigation: IntelliJ allows outbound HTTP; we only need `java.net.HttpURLConnection` or OkHttp, both available. No native binaries required.
- **Zed extension API maturity** → Mitigation: Zed's extension API is still evolving; scope Zed to the slash-command trigger only for MVP, skip ghost-text if the API doesn't support it yet.
- **API key stored in plain JSON** → Mitigation: Document this; use OS keychain integration post-MVP.

## Migration Plan

1. No existing users or data to migrate.
2. Deploy order: inference server → VS Code extension → UI → IntelliJ plugin → Zed extension.
3. Rollback: disable extensions; the Electrobun app is standalone and can be killed.

## Open Questions

- Should inline ghost-text completions be opt-in (off by default, toggled in settings) to avoid excessive API calls?
- What is the exact Zed extension API surface for inline assist as of the current Zed release? Needs a spike.
- Should the UI support multiple simultaneous file/line contexts (tabs), or strictly one at a time for MVP?
