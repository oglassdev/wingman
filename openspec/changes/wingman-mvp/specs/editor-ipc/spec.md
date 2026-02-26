## ADDED Requirements

### Requirement: CLI argument parsing for initial context injection
The Electrobun main process SHALL parse `--file <path>`, `--line <n>`, and `--selection "<text>"` from the process argv. After the Bun HTTP server starts, the main process SHALL call `POST /context` on the server with the parsed values so the server's context state is populated before the UI opens.

#### Scenario: App launched with full context
- **WHEN** the app is launched with `--file /src/foo.ts --line 10 --selection "const x = 1"`
- **THEN** the main process calls `POST /context` with `{ file, line, selection }` and then opens the BrowserWindow; the React UI reads context from the server via `/context` on mount

#### Scenario: App launched with no context
- **WHEN** the app is launched with no CLI arguments
- **THEN** no `POST /context` call is made; the UI displays "No file context"

### Requirement: Already-running guard — forward context to live server
When an editor extension launches the Wingman app while it is already running (detected by a successful `GET /health` on the known port), the extension SHALL call `POST /context` directly on the running server instead of spawning a new process. The server's context update SHALL cause the UI to refresh its context header via polling.

#### Scenario: Second launch from extension, app already running
- **WHEN** an extension tries to launch Wingman and `GET /health` succeeds
- **THEN** the extension calls `POST /context` on the running server and does not spawn a new process

#### Scenario: Extension launches app for the first time
- **WHEN** `GET /health` fails (app not running)
- **THEN** the extension spawns the Wingman subprocess with `--file`, `--line`, `--selection` CLI args

### Requirement: UI reads context from server on mount and polls for updates
The React UI SHALL fetch the current context by calling `GET /context` on the Bun server when it mounts and SHALL poll every 2 seconds to detect updates pushed by extensions.

#### Scenario: UI mounts with active context
- **WHEN** the React app loads and the server has a non-null context
- **THEN** the context header displays the current file and line

#### Scenario: Context updated by extension while UI is open
- **WHEN** an extension calls `POST /context` and the UI polls within 2 seconds
- **THEN** the context header updates to reflect the new file/line without a page reload

### Requirement: Settings IPC — read and write via Electrobun IPC
The Electrobun main process SHALL expose two IPC handlers to the React UI: `settings:read` (returns current settings JSON) and `settings:write` (writes updated settings JSON and calls `POST /reload-config` on the Bun server so the agent is reconfigured immediately).

#### Scenario: UI reads settings on mount
- **WHEN** the React settings panel mounts
- **THEN** it calls `settings:read` via IPC and receives the current settings object

#### Scenario: UI writes settings
- **WHEN** the user saves settings
- **THEN** the UI calls `settings:write` via IPC; the main process writes the file and calls `POST /reload-config`; subsequent inference requests use the new configuration

### Requirement: Write-back initiated from UI via server
The React UI SHALL POST the generated code to the server's `/writeback` endpoint (not via IPC) using the file/line from the current context, so extensions polling the server receive the result.

#### Scenario: Write-back initiated
- **WHEN** the user clicks "Write to Editor" in the UI
- **THEN** the UI calls `POST http://localhost:<port>/writeback` with `{ file, line, code }` from the current context
