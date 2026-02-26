# Wingman

An AI code assistant desktop app with editor extensions for VS Code, IntelliJ, and Zed.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Overview

Wingman provides inline ghost-text completions and a floating AI assistant panel that integrates with your favorite editors. It uses a Bun HTTP server to own all AI state (context, prompts, configuration) and thin HTTP clients in each editor extension.

## Architecture

```
┌─────────────────┐     HTTP/SSE      ┌──────────────────┐
│  VS Code Ext    │◄─────────────────►│                  │
├─────────────────┤                   │   Bun Server     │
│  IntelliJ Plugin│◄─────────────────►│   (pi-agent)     │
├─────────────────┤                   │                  │
│  Zed Extension  │◄─────────────────►│   ┌──────────┐   │
└─────────────────┘                   │   │ Electrobun│   │
                                      │   │   UI     │   │
                                      │   └──────────┘   │
                                      └──────────────────┘
```

**Key Design Decisions:**
- **Server owns all state** — Extensions are thin HTTP clients, server constructs prompts
- **pi-agent-core** — Multi-provider LLM support (Anthropic, OpenAI, Ollama) with streaming
- **CLI launch + local HTTP** — Extensions launch the app with `--file --line --selection` args
- **Floating panel** — 640×480 always-on-top window, stays in menu bar when closed

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.0+
- Node.js 18+ (for VS Code extension)
- IntelliJ IDEA 2024.1+ (for IntelliJ plugin development)
- Rust + wasm32-wasi target (for Zed extension)

### Installation

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Build the project:**
   ```bash
   bun run build
   ```

3. **Start the Wingman app:**
   ```bash
   bun run dev
   # Or with HMR:
   bun run dev:hmr
   ```

4. **Install editor extensions:**
   ```bash
   ./scripts/install-extensions.sh
   ```

### Configuration

On first launch, open the Wingman settings panel and configure:
- **Provider**: anthropic, openai, or ollama
- **Model ID**: e.g., `claude-sonnet-4-20250514` or `gpt-4o`
- **API Key**: Your provider API key
- **Temperature**: 0.0–1.0 (default: 0.7)

Settings are stored in `~/Library/Application Support/wingman/wingman-settings.json`.

## Usage

### Inline Completions

Pause typing in your editor. Wingman will show ghost-text completions after a 300ms debounce.

### AI Assistant Panel

Run the "Wingman: Open" command in your editor:
- **VS Code**: Command Palette → "Wingman: Open"
- **IntelliJ**: Tools → "Open Wingman"
- **Zed**: `/wingman` slash command

This launches the floating panel with your current file/line context. Type a prompt and click "Generate" to get AI assistance.

### Write Back to Editor

After generating code in the Wingman UI, click "Write to Editor" to insert the result at the cursor position.

## Development

### Project Structure

```
wingman/
├── apps/
│   ├── server/          # Electrobun main process + Bun HTTP server
│   └── client/          # React 19 + Vite + Tailwind v4 UI
├── packages/
│   └── shared/          # Protocol types, port discovery, HTTP helpers
├── extensions/
│   ├── vscode/          # VS Code extension (TypeScript)
│   ├── intellij/        # IntelliJ plugin (Kotlin)
│   └── zed/             # Zed extension (Rust/WASM)
└── docs/
    └── best-practices/  # Language-specific coding guidelines
```

### Running Individual Components

```bash
# Server only
bun run dev --filter=@wingman/server

# VS Code extension (development host)
cd extensions/vscode && npm run dev

# IntelliJ plugin
./gradlew :extensions:intellij:runIde

# Zed extension
cd extensions/zed && cargo build --target wasm32-wasi
```

See [docs/best-practices](./docs/best-practices/) for detailed coding guidelines.

## API Endpoints

The Bun server exposes these HTTP endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server status, returns `{ ok, port, model }` |
| `/context` | POST | Update editor context (file, line, selection) |
| `/context` | GET | Get current context (for UI polling) |
| `/inline` | GET | Get FIM completion, streams SSE |
| `/generate` | POST | Free-form generation, streams SSE |
| `/writeback` | POST | Store code for editor to pick up |
| `/writeback` | GET | Poll for write-back (with `?file=` param) |
| `/abort` | POST | Abort current agent run |
| `/reload-config` | POST | Apply new settings to running agent |

## License

MIT License — see [LICENSE](./LICENSE) for details.

## Acknowledgments

Built with:
- [Electrobun](https://electrobun.dev/) — Bun-native desktop apps
- [@mariozechner/pi-agent-core](https://www.npmjs.com/package/@mariozechner/pi-agent-core) — AI agent framework
- [pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) — Multi-provider LLM support
