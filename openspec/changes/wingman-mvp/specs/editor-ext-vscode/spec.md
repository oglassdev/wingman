## ADDED Requirements

### Requirement: Inline completion provider registration
The VS Code extension SHALL register an inline completion provider that activates for all file types and delegates to the inline completion engine via the local inference HTTP server.

#### Scenario: Extension activates on VS Code start
- **WHEN** VS Code starts with the Wingman extension installed
- **THEN** the inline completion provider is registered and ready to serve completions

#### Scenario: Ghost text appears after debounce
- **WHEN** the user pauses typing for 300ms in any file
- **THEN** a completion request is sent and the result appears as VS Code ghost text

### Requirement: "Open Wingman" command with line reference
The VS Code extension SHALL provide a command ("Wingman: Open") that launches the Wingman Electrobun app (or focuses it if already running) passing the current file path, cursor line number, and selected text as CLI arguments.

#### Scenario: Command triggered with selection
- **WHEN** the user runs "Wingman: Open" with text selected in the editor
- **THEN** the Wingman app is launched (or focused) with `--file <path> --line <line> --selection "<selected text>"`

#### Scenario: Command triggered without selection
- **WHEN** the user runs "Wingman: Open" with no text selected
- **THEN** the Wingman app is launched with `--file <path> --line <line>` and no `--selection` argument

### Requirement: Write-back from Wingman UI
The VS Code extension SHALL listen for write-back events from the Wingman HTTP server and insert the provided code at the specified line in the active editor.

#### Scenario: Write-back event received
- **WHEN** the Wingman HTTP server emits a write-back event with `{ file, line, code }`
- **THEN** the extension inserts `code` at the specified line in the matching open editor document

### Requirement: Extension settings
The VS Code extension SHALL expose a setting (`wingman.inferencePort`) to configure the local inference server port (default: `7891`) in VS Code's settings UI.

#### Scenario: Custom port configured
- **WHEN** the user sets `wingman.inferencePort` to a non-default value
- **THEN** all HTTP calls from the extension use the configured port
