## ADDED Requirements

### Requirement: Floating panel window mode
The Wingman UI SHALL open as a small floating panel (640×480px) that remains on top of other windows and is positioned near the top-right of the primary display.

#### Scenario: App launched by editor extension
- **WHEN** the Electrobun app is launched via CLI by an editor extension
- **THEN** a 640×480 floating window appears near the top-right of the screen

#### Scenario: App already running when editor extension launches it
- **WHEN** the Electrobun app is already running and an editor extension invokes it again
- **THEN** the existing window is brought to front and the new context (`--file`, `--line`, `--selection`) is applied

### Requirement: Context header showing active file and line
The UI SHALL display the active file path and line number passed via CLI arguments in a context header at the top of the panel.

#### Scenario: App launched with file and line context
- **WHEN** the app starts with `--file /path/to/file.ts --line 42`
- **THEN** the context header shows the filename and line number

#### Scenario: No context provided
- **WHEN** the app starts without `--file` or `--line` arguments
- **THEN** the context header shows "No file context" and the code generation panel is disabled

### Requirement: Settings panel
The UI SHALL provide a settings view with fields for: LLM backend URL (default `http://localhost:11434` for Ollama or an OpenAI-compatible URL), API key (optional, masked input), model name, and temperature (slider 0.0–1.0).

#### Scenario: User saves settings
- **WHEN** the user changes any setting and clicks "Save"
- **THEN** settings are persisted to the app data JSON file and the inference server reloads its config

#### Scenario: Settings loaded on startup
- **WHEN** the app starts
- **THEN** previously saved settings are loaded and displayed in the settings form

### Requirement: Code generation panel with streaming output
The UI SHALL provide a code generation view where the user can enter a prompt, submit it, and see the streaming AI response rendered in a syntax-highlighted code block.

#### Scenario: User submits a prompt
- **WHEN** the user types a prompt and presses Enter or clicks "Generate"
- **THEN** the UI sends the prompt plus the file context to the inference server and streams the response into a code block

#### Scenario: Streaming in progress
- **WHEN** tokens are streaming in
- **THEN** the code block updates incrementally and a "Stop" button is visible

### Requirement: Write-back to editor
The UI SHALL provide a "Write to Editor" button that sends the generated code back to the editor extension via the inference server's write-back endpoint (`POST /writeback`), targeting the file and line from the current context.

#### Scenario: User clicks "Write to Editor"
- **WHEN** the user clicks "Write to Editor" after generation completes
- **THEN** a POST request is made to `/writeback` with `{ file, line, code }` and the button shows a "Sent!" confirmation

#### Scenario: Write-back when no editor is connected
- **WHEN** no editor extension is polling for write-back events
- **THEN** the button still posts the event; it will be picked up when the extension next polls

### Requirement: System tray / menu bar persistence
The UI SHALL add a system tray (macOS menu bar) icon so the app stays running after the window is closed, avoiding cold-start latency on subsequent editor invocations.

#### Scenario: User closes the window
- **WHEN** the user clicks the window close button
- **THEN** the window hides but the process continues running; the menu bar icon remains visible

#### Scenario: User quits from menu bar icon
- **WHEN** the user selects "Quit Wingman" from the menu bar icon context menu
- **THEN** the app terminates fully
