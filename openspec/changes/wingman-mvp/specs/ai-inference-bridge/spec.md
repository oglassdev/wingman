## ADDED Requirements

### Requirement: pi-agent-powered inference engine
The Bun server SHALL instantiate a single `Agent` from `@mariozechner/pi-agent-core` as its inference engine. All LLM calls SHALL flow through this agent. The agent SHALL be configured at startup from the settings file (provider, model ID, API key, temperature) and SHALL be reconfigurable at runtime without restarting.

#### Scenario: Server starts with valid settings
- **WHEN** the server starts and a valid settings file exists
- **THEN** an `Agent` is instantiated with the configured model and system prompt, and ready to accept requests

#### Scenario: Server starts with no settings file
- **WHEN** the server starts and no settings file exists
- **THEN** the agent is instantiated in an unconfigured state and all inference endpoints return HTTP 503 with `{ error: "Wingman not configured. Open the settings panel." }`

### Requirement: Server-owned context state
The server SHALL maintain a current context object `{ file: string|null, line: number|null, selection: string|null, surroundingCode: string|null }`. This context is updated by `POST /context` and is used by all inference endpoints to construct prompts. Extensions SHALL NOT construct prompts themselves.

#### Scenario: Context set by extension
- **WHEN** an extension POSTs `{ file, line, selection, surroundingCode }` to `/context`
- **THEN** the server stores the new context, resets the agent's message history (`agent.clearMessages()`), and rebuilds the system prompt to include the new file/line/selection context, returning `{ ok: true }`

#### Scenario: Context cleared
- **WHEN** `POST /context` is called with `{ file: null, line: null }`
- **THEN** the server clears the context and resets the agent to a generic assistant state

### Requirement: `/inline` endpoint for ghost-text completions
The server SHALL expose `GET /inline` that constructs a fill-in-the-middle (FIM) prompt from the stored context and streams the agent's completion as SSE tokens. The extension does NOT supply a prompt — the server owns the prompt template.

#### Scenario: Inline request with valid context
- **WHEN** an extension GETs `/inline` and the server has a valid context (file + surroundingCode)
- **THEN** the server calls `agent.prompt(fiMPrompt)`, subscribes to `message_update` events, and streams each `delta` as `data: <token>\n\n`, ending with `data: [DONE]\n\n`

#### Scenario: Inline request aborted by new keystroke
- **WHEN** the SSE connection is closed by the extension (new keystroke / debounce reset)
- **THEN** the server detects the closed connection and calls `agent.abort()`

#### Scenario: Concurrent inline request received
- **WHEN** a second `GET /inline` arrives while an agent run is already streaming
- **THEN** the server calls `agent.abort()` on the running turn, waits for idle, then starts the new request

#### Scenario: No context available
- **WHEN** an extension GETs `/inline` and no file context has been set
- **THEN** the server returns HTTP 400 with `{ error: "No context. Call POST /context first." }`

### Requirement: `/generate` endpoint for UI-driven generation
The server SHALL expose `POST /generate` that accepts `{ prompt: string }` and streams the agent's response as SSE, using the stored context in the system prompt. This is the endpoint the Wingman UI uses for the code generation panel.

#### Scenario: Generate with context and prompt
- **WHEN** the UI POSTs `{ prompt: "Refactor this to use async/await" }` to `/generate`
- **THEN** the server calls `agent.prompt(userPrompt)` with the stored context in the system prompt and streams SSE tokens back

#### Scenario: Abort in-flight generation
- **WHEN** `POST /abort` is called while a generation is streaming
- **THEN** the server calls `agent.abort()` and the SSE stream closes

### Requirement: Write-back event store
The server SHALL maintain an in-memory write-back store keyed by file path. `POST /writeback` adds an entry; `GET /writeback?file=<path>` returns and removes the entry for that file.

#### Scenario: Write-back posted by UI
- **WHEN** the UI POSTs `{ file: "/path/to/file.ts", line: 42, code: "..." }` to `/writeback`
- **THEN** the server stores the entry and returns `{ ok: true }`

#### Scenario: Extension polls and finds entry
- **WHEN** an extension GETs `/writeback?file=/path/to/file.ts` and an entry exists
- **THEN** the server returns `{ file, line, code }` and removes the entry

#### Scenario: Extension polls and no entry exists
- **WHEN** an extension GETs `/writeback?file=/path/to/file.ts` and no entry exists
- **THEN** the server returns `{ file: null, line: null, code: null }`

### Requirement: `/reload-config` applies new settings to the running agent
The server SHALL expose `POST /reload-config` that reads the settings JSON file and calls `agent.setModel(getModel(...))`, `agent.setSystemPrompt(...)`, and stores the new API key for subsequent requests — without restarting the server process.

#### Scenario: Settings updated via UI
- **WHEN** the UI saves new settings and the main process calls `POST /reload-config`
- **THEN** the agent is reconfigured and the next inference request uses the new model/key

### Requirement: Port fallback and discovery
The server SHALL attempt to bind to port `7891`. If occupied, it SHALL bind to a random free port. In both cases it SHALL write the chosen port number to `$TMPDIR/wingman.port` so extensions can discover it.

#### Scenario: Default port available
- **WHEN** port 7891 is free at startup
- **THEN** the server binds to 7891 and writes `7891` to `$TMPDIR/wingman.port`

#### Scenario: Default port occupied
- **WHEN** port 7891 is in use
- **THEN** the server binds to a random free port and writes that port to `$TMPDIR/wingman.port`

### Requirement: Health check
The server SHALL expose `GET /health` returning `{ ok: true, port: number, model: string|null }` with HTTP 200.

#### Scenario: Health check
- **WHEN** any client GETs `/health`
- **THEN** the server returns HTTP 200 with the current port and configured model name (or null if unconfigured)
