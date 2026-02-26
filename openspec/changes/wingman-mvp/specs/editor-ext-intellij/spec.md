## ADDED Requirements

### Requirement: Inline completion contributor registration
The IntelliJ plugin SHALL register an `EditorInlayHintsProvider` (or equivalent inline completion API) that activates in all file types and fetches completions from the Wingman inference HTTP server.

#### Scenario: Plugin activates on IDE start
- **WHEN** IntelliJ starts with the Wingman plugin installed and enabled
- **THEN** the inline completion contributor is registered

#### Scenario: Ghost text appears after debounce
- **WHEN** the user pauses typing for 300ms in the editor
- **THEN** a completion request is sent to the local inference server and the result is rendered as inline hint text

### Requirement: "Open Wingman" action
The IntelliJ plugin SHALL provide an action ("Open Wingman") accessible from the editor toolbar and context menu that launches the Wingman Electrobun app with the current file path, cursor line, and selection.

#### Scenario: Action triggered with selection
- **WHEN** the user invokes "Open Wingman" with text selected
- **THEN** the Wingman process is launched (or brought to front) with `--file <path> --line <line> --selection "<text>"`

#### Scenario: Action triggered without selection
- **WHEN** the user invokes "Open Wingman" with no selection
- **THEN** the Wingman process is launched with `--file <path> --line <line>`

### Requirement: Write-back polling
The IntelliJ plugin SHALL poll the Wingman HTTP server (`GET /writeback?file=<path>`) after launching the UI and, upon receiving a result, insert the code at the specified line using IntelliJ's document write API on the EDT.

#### Scenario: Write-back result available
- **WHEN** polling returns a non-empty write-back payload
- **THEN** the plugin inserts the code at the correct line inside a write action and stops polling

#### Scenario: No result within timeout
- **WHEN** 120 seconds elapse with no write-back result
- **THEN** the plugin stops polling silently

### Requirement: Configurable inference port
The IntelliJ plugin SHALL persist the inference server port (default `7891`) in IntelliJ's `PropertiesComponent` and expose it in a settings page under Preferences > Tools > Wingman.

#### Scenario: Settings page opens
- **WHEN** the user navigates to Preferences > Tools > Wingman
- **THEN** a settings panel is shown with a port field pre-filled with the current value
