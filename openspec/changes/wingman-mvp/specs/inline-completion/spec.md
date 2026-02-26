## ADDED Requirements

### Requirement: Extension-side debounce before calling `/inline`
The inline completion trigger in each editor extension SHALL debounce calls to the server's `GET /inline` endpoint by 300ms after the last keystroke, and SHALL close any open SSE connection when a new keystroke arrives (causing the server to abort its agent run).

#### Scenario: Keystroke during debounce window resets timer
- **WHEN** the user types a character while a debounce timer is running
- **THEN** the timer resets to 300ms from the new keystroke and any open `/inline` SSE connection is closed

#### Scenario: SSE connection closed on new keystroke
- **WHEN** a `/inline` SSE stream is open and the user types a new character
- **THEN** the extension closes the SSE connection (triggering server-side abort) and starts a new debounce timer

### Requirement: Context push before `/inline` request
Before opening the `/inline` SSE connection, the extension SHALL call `POST /context` with the current file path, cursor line, selected text (if any), and the surrounding N lines of code (default: 20 lines before cursor, 10 lines after). The server constructs the FIM prompt from this context.

#### Scenario: Context pushed successfully
- **WHEN** the debounce timer fires with a valid editor state
- **THEN** the extension POSTs `{ file, line, selection, surroundingCode }` to `/context` and, on success, opens the `/inline` SSE connection

#### Scenario: `/context` call fails
- **WHEN** `POST /context` returns an error (server not running, network error)
- **THEN** the extension silently skips the inline request and logs a debug message; no ghost text is shown

### Requirement: Streaming ghost-text rendering from SSE tokens
The extension SHALL consume the SSE token stream from `GET /inline` and update the ghost-text display incrementally as tokens arrive, without waiting for the full response.

#### Scenario: First token received
- **WHEN** the first `data:` event arrives from the `/inline` SSE stream
- **THEN** ghost text appears at the cursor position containing that token

#### Scenario: Subsequent tokens appended
- **WHEN** additional `data:` events arrive
- **THEN** the ghost text is updated in place, appending the new tokens

#### Scenario: `[DONE]` received
- **WHEN** the SSE stream sends `data: [DONE]`
- **THEN** the extension closes the connection and leaves the complete ghost text displayed

### Requirement: User accepts or dismisses completion
The extension SHALL allow the user to accept the full ghost-text suggestion with Tab and dismiss it with Escape (or any non-Tab keystroke that isn't a cursor move).

#### Scenario: User presses Tab
- **WHEN** a ghost-text suggestion is visible and the user presses Tab
- **THEN** the suggestion is inserted into the document at the cursor position and ghost text is removed

#### Scenario: User presses Escape or types
- **WHEN** a ghost-text suggestion is visible and the user presses Escape or types any character
- **THEN** the ghost text is dismissed, the SSE connection is closed, and the server aborts its run
