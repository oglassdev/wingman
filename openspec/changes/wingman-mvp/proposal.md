## Why

Wingman exists to replicate GitHub Copilot's core inline-edit experience while giving users a richer, local-first control surface. The current codebase is a skeleton — a blank Electrobun window with no editor integrations, no AI inference, and no way to target a specific line of code. Building the MVP unblocks the core user loop: developer selects code → triggers Wingman → sees an AI-generated edit suggestion inline, without leaving their editor.

## What Changes

- **New**: VS Code extension that provides ghost-text inline completions and an "Open Wingman" command bound to a line reference
- **New**: IntelliJ plugin (Kotlin) that provides the same inline completion and command trigger
- **New**: Zed extension that hooks into Zed's slash-command / inline-assist API
- **New**: Wingman Control UI — replaces the current placeholder React app with a functional settings + code-generation panel that accepts a `--line` argument (file path + line number) when launched, so it knows where to write generated code back to
- **New**: Local AI inference bridge — a lightweight Bun HTTP server embedded in the Electrobun main process that proxies requests to a configurable LLM backend (OpenAI-compatible API or local Ollama)
- **New**: IPC protocol between editor extensions and the Electrobun app (launch-with-context + write-back)
- **Modified**: Electrobun server entry point and config to support the new windowing mode (small floating panel) and CLI argument parsing

## Capabilities

### New Capabilities

- `inline-completion`: Ghost-text / inline edit suggestion engine shared across editor extensions — handles debouncing, prompt construction, and streaming response rendering in the editor
- `editor-ext-vscode`: VS Code extension package — registers the inline completion provider and the "Open Wingman" command
- `editor-ext-intellij`: IntelliJ/JetBrains plugin — registers an inline completion contributor and action to open Wingman
- `editor-ext-zed`: Zed extension — hooks into Zed's extension API for slash-command and inline assist
- `wingman-ui`: The Electrobun control panel — settings page (API key, model selection, temperature), code generation panel that renders the AI response and can write it back to the editor at the specified line reference
- `ai-inference-bridge`: Bun HTTP server (runs inside Electrobun main process) that accepts a structured prompt request and streams completions from a configurable OpenAI-compatible backend or Ollama
- `editor-ipc`: Protocol definition and handlers for editor extensions to launch the Wingman UI with context (file, line, selected text) and receive write-back events

### Modified Capabilities

_(none — no existing specs)_

## Impact

- `apps/server/src/index.ts` — extend to parse CLI args (`--file`, `--line`, `--selection`), start the AI inference HTTP server, and expose IPC handlers
- `apps/server/electrobun.config.ts` — adjust window dimensions for the floating panel mode
- `apps/client/src/` — replace placeholder app with the real Wingman UI (settings + code generation views)
- New top-level directories: `extensions/vscode/`, `extensions/intellij/`, `extensions/zed/`
- New package: `packages/shared/` for prompt-construction utilities shared between the inference bridge and extensions
- Dependencies added: streaming fetch, a simple JSON-RPC or HTTP client in each extension
