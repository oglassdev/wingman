## ADDED Requirements

### Requirement: OpenAI-compatible chat completions endpoint
The inference bridge SHALL expose a `POST /complete` endpoint that accepts a JSON body `{ prompt: string, stream?: boolean, model?: string, temperature?: number }` and returns a streaming SSE response of completion tokens.

#### Scenario: Streaming completion request
- **WHEN** a client POSTs to `/complete` with `{ prompt: "...", stream: true }`
- **THEN** the server responds with `Content-Type: text/event-stream` and streams tokens as `data: <token>\n\n` until the model signals completion with `data: [DONE]\n\n`

#### Scenario: Non-streaming completion request
- **WHEN** a client POSTs to `/complete` with `{ prompt: "...", stream: false }`
- **THEN** the server responds with `{ text: "<full completion>" }` after the model finishes

### Requirement: Write-back event store
The inference bridge SHALL maintain an in-memory write-back store. `POST /writeback` adds an entry; `GET /writeback?file=<path>` returns and removes the entry for that file (long-poll style).

#### Scenario: Write-back posted by UI
- **WHEN** the UI POSTs `{ file: "/path/to/file.ts", line: 42, code: "..." }` to `/writeback`
- **THEN** the server stores the entry and returns `{ ok: true }`

#### Scenario: Extension polls and finds entry
- **WHEN** an extension GETs `/writeback?file=/path/to/file.ts` and an entry exists
- **THEN** the server returns `{ file, line, code }` and removes the entry from the store

#### Scenario: Extension polls and no entry exists
- **WHEN** an extension GETs `/writeback?file=/path/to/file.ts` and no entry exists
- **THEN** the server returns `{ file: null, line: null, code: null }`

### Requirement: Configuration reload
The inference bridge SHALL reload its LLM backend URL, API key, model, and temperature from the settings JSON file without restarting when it receives a `POST /reload-config` request.

#### Scenario: Config reload requested after settings save
- **WHEN** the UI saves new settings and sends `POST /reload-config`
- **THEN** the server reads the settings file and applies the new values to subsequent requests

### Requirement: Port fallback
The inference bridge SHALL attempt to bind to port `7891` and, if that port is occupied, SHALL bind to an OS-assigned random port and write the chosen port to `$TMPDIR/wingman.port`.

#### Scenario: Default port available
- **WHEN** port 7891 is free at startup
- **THEN** the server binds to 7891 and writes `7891` to `$TMPDIR/wingman.port`

#### Scenario: Default port occupied
- **WHEN** port 7891 is in use at startup
- **THEN** the server binds to a random free port and writes that port number to `$TMPDIR/wingman.port`

### Requirement: Health check endpoint
The inference bridge SHALL expose `GET /health` that returns `{ ok: true, port: <port> }` with HTTP 200.

#### Scenario: Health check
- **WHEN** any client GETs `/health`
- **THEN** the server responds with HTTP 200 and `{ ok: true, port: <current port> }`
