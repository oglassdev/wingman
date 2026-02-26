# Wingman — AI Code Assistant

This is an Electrobun desktop application that provides AI code assistance through editor extensions.

IMPORTANT: Electrobun is NOT Electron. Do not use Electron APIs or patterns.

## Quick Links

- **Full Electrobun API**: https://blackboard.sh/electrobun/llms.txt
- **Electrobun Docs**: https://blackboard.sh/electrobun/docs/
- **Best Practices**: See [docs/best-practices/](./docs/best-practices/) for language-specific guidelines

## Architecture

Wingman uses a **server-owning-state** architecture:
- Bun HTTP server maintains all AI state (context, agent, settings)
- Editor extensions are thin HTTP clients calling endpoints like `/context`, `/inline`, `/generate`
- Electrobun UI is a floating panel that also communicates via HTTP + typed IPC

## Import Patterns

### Main Process (Bun)
```typescript
import { BrowserWindow, Tray, Utils } from "electrobun/bun";
```

### Browser Context (React)
```typescript
import { Electroview } from "electrobun/view";
```

### pi-agent-core (Inference Engine)
```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
```

## Key Conventions

### Electrobun IPC
Use typed RPC, NOT string-based IPC:
```typescript
// Define in shared/types.ts
const rpc = BrowserView.defineRPC<WingmanRPC>({
  handlers: { requests: { "settings:read": async () => loadSettings() } }
});
```

### Asset URLs
Use `views://` URLs to load bundled assets:
```typescript
url: "views://mainview/index.html"
```

Views must be configured in `electrobun.config.ts`.

## Best Practices by Language

| Layer | Guide |
|-------|-------|
| Bun Server | [docs/best-practices/typescript-bun.md](./docs/best-practices/typescript-bun.md) |
| Electrobun Main | [docs/best-practices/electrobun.md](./docs/best-practices/electrobun.md) |
| React UI | [docs/best-practices/react-vite.md](./docs/best-practices/react-vite.md) |
| VS Code Extension | [docs/best-practices/vscode-extension.md](./docs/best-practices/vscode-extension.md) |
| IntelliJ Plugin | [docs/best-practices/intellij-plugin.md](./docs/best-practices/intellij-plugin.md) |
| Zed Extension | [docs/best-practices/zed-extension.md](./docs/best-practices/zed-extension.md) |
| All Layers | [docs/best-practices/cross-cutting.md](./docs/best-practices/cross-cutting.md) |

## Commit Style

All commits must use conventional commits with these prefixes:

- **`feat:`** — New features or capabilities
- **`fix:`** — Bug fixes
- **`chore:`** — Maintenance, tooling, dependencies, build scripts
- **`doc:`** — Documentation updates (README, comments, guides)

### Examples

```bash
feat: add SSE streaming to /inline endpoint
fix: handle port file race condition in extensions
chore: upgrade gradle to 9.2.1
doc: add intellij threading best practices
```

### Rules

1. Use lowercase after the colon
2. No period at the end
3. Keep subject line under 72 characters
4. Use body for detailed explanation when needed

## About Electrobun

Electrobun is built by Blackboard (https://blackboard.sh), an innovation lab building
tools and funding teams that define the next generation of technology.
