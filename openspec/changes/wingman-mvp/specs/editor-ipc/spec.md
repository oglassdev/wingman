## ADDED Requirements

### Requirement: CLI argument parsing for context injection
The Electrobun main process SHALL parse `--file <path>`, `--line <n>`, and `--selection "<text>"` from the process argv and pass them to the React UI via Electrobun IPC on window creation.

#### Scenario: App launched with full context
- **WHEN** the app is launched with `--file /src/foo.ts --line 10 --selection "const x = 1"`
- **THEN** the React UI receives `{ file: "/src/foo.ts", line: 10, selection: "const x = 1" }` via IPC on mount

#### Scenario: App launched with no context
- **WHEN** the app is launched with no CLI arguments
- **THEN** the React UI receives `{ file: null, line: null, selection: null }`

### Requirement: Context update when app is already running
When an editor extension launches the app while it is already running, the new CLI context SHALL be delivered to the running instance via the inference server's `POST /context` endpoint (the extension calls the running server, the server notifies the UI via IPC).

#### Scenario: Second launch with new context
- **WHEN** the app is running and an extension calls `POST /context` with `{ file, line, selection }`
- **THEN** the inference bridge receives the new context, forwards it to the React UI via Electrobun IPC, and the UI updates its context header

### Requirement: Write-back triggered from UI sends to inference bridge
The React UI SHALL call the inference bridge's `POST /writeback` endpoint when the user clicks "Write to Editor", using the current file/line context and the generated code.

#### Scenario: Write-back initiated
- **WHEN** the user clicks "Write to Editor" in the UI
- **THEN** the UI calls `POST http://localhost:<port>/writeback` with `{ file, line, code }`

### Requirement: Settings IPC — read and write
The Electrobun main process SHALL expose two IPC handlers to the React UI: `settings:read` (returns current settings JSON) and `settings:write` (writes updated settings JSON and calls `POST /reload-config` on the inference bridge).

#### Scenario: UI reads settings on mount
- **WHEN** the React settings panel mounts
- **THEN** it calls `settings:read` via IPC and receives the current settings object

#### Scenario: UI writes settings
- **WHEN** the user saves settings
- **THEN** the UI calls `settings:write` with the updated settings object; the main process writes the file and reloads the inference bridge config
