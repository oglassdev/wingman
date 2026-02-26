# Wingman Best Practices

This directory contains language-specific and cross-cutting best practices for the Wingman project.

## Structure

- **[typescript-bun.md](./typescript-bun.md)** — Bun server development with TypeScript, pi-agent-core usage, SSE streaming, HTTP routing
- **[electrobun.md](./electrobun.md)** — Electrobun main process patterns, typed IPC, window lifecycle, tray management
- **[react-vite.md](./react-vite.md)** — React 19 patterns, Vite setup, Tailwind v4, fetch streaming
- **[vscode-extension.md](./vscode-extension.md)** — VS Code extension development, inline completion provider, Node.js HTTP SSE
- **[intellij-plugin.md](./intellij-plugin.md)** — IntelliJ plugin with Kotlin, threading model, OkHttp SSE, settings persistence
- **[zed-extension.md](./zed-extension.md)** — Zed extension with Rust/WASM, synchronous extension API, `zed_extension_api` usage
- **[cross-cutting.md](./cross-cutting.md)** — Shared concerns: secrets handling, SSE format, port file race conditions, naming conventions

## Quick Reference

| Layer | Primary File Pattern | Key Constraint |
|-------|---------------------|----------------|
| Bun Server | `kebab-case.ts` | Single Agent instance, SSE streaming |
| Electrobun Main | `kebab-case.ts` | Typed RPC only, no string IPC |
| React UI | `PascalCase.tsx` | React 19, Tailwind v4, no tailwind.config.js |
| VS Code Extension | `kebab-case.ts` | Node.js http module for SSE |
| IntelliJ Plugin | `PascalCase.kt` | Background threads for I/O, EDT for UI |
| Zed Extension | `snake_case.rs` | WASM — no std::net, use zed_extension_api |

## Critical Rules

1. **Electrobun ≠ Electron** — No `ipcMain`/`ipcRenderer`. Use typed RPC via `BrowserView.defineRPC()`.
2. **pi-agent-core streaming** — Subscribe to `message_update` events before calling `prompt()`.
3. **Agent abort pattern** — Always `abort()` then `await waitForIdle()` before new runs.
4. **Zed WASM** — No async, no std networking. Use `zed_extension_api::http_client`.
5. **IntelliJ threading** — Network I/O in `Task.Backgroundable`, document edits in `WriteCommandAction.runWriteCommandAction`.
6. **SSE format** — Always use `data: <token>\n\n` with JSON encoding for newlines.
