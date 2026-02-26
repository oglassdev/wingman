## ADDED Requirements

### Requirement: Debounced completion requests
The inline completion engine SHALL debounce requests by 300ms after the last keystroke before sending a request to the inference server, and SHALL cancel any in-flight request when a new keystroke arrives.

#### Scenario: Keystroke during debounce window resets timer
- **WHEN** the user types a character while a debounce timer is running
- **THEN** the timer resets to 300ms from the new keystroke and the previous timer is cleared

#### Scenario: Request cancelled on new keystroke
- **WHEN** a completion request is in-flight and the user types a new character
- **THEN** the in-flight request is aborted and a new debounce timer starts

### Requirement: Prompt construction from editor context
The inline completion engine SHALL construct a fill-in-the-middle (FIM) prompt using the text before the cursor as the prefix and the text after the cursor as the suffix, up to a configurable token budget (default: 512 tokens prefix, 128 tokens suffix).

#### Scenario: Normal cursor position
- **WHEN** the cursor is mid-file with content before and after
- **THEN** a FIM prompt is constructed with the preceding lines as prefix and following lines as suffix, truncated to the token budget

#### Scenario: Cursor at end of file
- **WHEN** the cursor is at the very end of the file with no content after
- **THEN** a FIM prompt is constructed with an empty suffix

### Requirement: Streaming response rendering
The inline completion engine SHALL begin rendering the completion as tokens stream in, updating the ghost-text display incrementally without waiting for the full response.

#### Scenario: First token received
- **WHEN** the first SSE token arrives from the inference server
- **THEN** ghost text appears at the cursor position containing that token

#### Scenario: Subsequent tokens received
- **WHEN** additional SSE tokens arrive
- **THEN** the ghost text is updated in place, appending the new tokens

### Requirement: User accepts or dismisses completion
The inline completion engine SHALL allow the user to accept the full suggestion with Tab and dismiss it with Escape (or any non-Tab keystroke).

#### Scenario: User presses Tab
- **WHEN** a ghost-text suggestion is visible and the user presses Tab
- **THEN** the suggestion is inserted into the document at the cursor position and ghost text is removed

#### Scenario: User presses Escape or types
- **WHEN** a ghost-text suggestion is visible and the user presses Escape or types any character
- **THEN** the ghost text is dismissed without modifying the document
