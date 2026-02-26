## ADDED Requirements

### Requirement: Slash-command registration
The Zed extension SHALL register a slash command (`/wingman`) in Zed's assistant panel that sends the current buffer context to the Wingman inference server and streams the response back into the assistant panel.

#### Scenario: Slash command invoked
- **WHEN** the user types `/wingman <prompt>` in the Zed assistant panel
- **THEN** the extension calls the local inference server with the prompt and streams the response into the assistant panel

#### Scenario: Inference server not running
- **WHEN** the extension cannot reach the inference server on the configured port
- **THEN** the extension outputs an error message: "Wingman is not running. Launch the Wingman app first."

### Requirement: "Open Wingman" action via command palette
The Zed extension SHALL register a command palette action ("wingman: open") that launches the Wingman Electrobun app with the current file path and cursor line.

#### Scenario: Action triggered in editor
- **WHEN** the user runs "wingman: open" from the command palette
- **THEN** the Wingman app is launched with `--file <path> --line <line>`

### Requirement: Inline assist integration (best-effort)
The Zed extension SHALL attempt to register an inline assist provider if the Zed extension API supports it at the time of implementation. If the API is not available or unstable, this requirement is deferred post-MVP.

#### Scenario: Inline assist available
- **WHEN** the Zed extension API supports `register_inline_assist_provider`
- **THEN** the extension registers a provider that calls the Wingman inference server

#### Scenario: Inline assist not available
- **WHEN** the Zed extension API does not expose inline assist
- **THEN** the extension skips registration and logs a debug message; slash-command remains functional

### Requirement: Configurable inference port via extension settings
The Zed extension SHALL read the inference server port from Zed's extension settings (default `7891`).

#### Scenario: Port configured in settings
- **WHEN** the user sets `wingman.inference_port` in Zed's settings JSON
- **THEN** all HTTP calls use the configured port
