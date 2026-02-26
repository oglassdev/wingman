# Wingman

An Electrobun desktop application with a server/client architecture using Turborepo.

## Architecture

```
├── apps/
│   ├── server/          # Electrobun main process (Bun runtime)
│   └── client/          # React frontend (Vite + Tailwind CSS)
├── packages/            # Shared packages (future)
└── turbo.json           # Turborepo configuration
```

- **Server**: The Electrobun main process that runs on Bun, manages windows, and provides native APIs.
- **Client**: A React application built with Vite and styled with Tailwind CSS.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (runtime and package manager)

### Installation

```bash
bun install
```

### Development

**Without HMR (standard development):**
```bash
bun run dev
```

**With HMR (hot module replacement):**
```bash
bun run dev:hmr
```

### Building

```bash
bun run build
```

### Project Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development without HMR |
| `bun run dev:hmr` | Start development with hot reload |
| `bun run build` | Build all packages for production |
| `bun run clean` | Clean build artifacts |

## Package Structure

### `@wingman/server`

Location: `apps/server/`

The Electrobun main process. Handles:
- Window management
- Native OS APIs
- IPC communication with the client

### `@wingman/client`

Location: `apps/client/`

The React frontend. Features:
- React 19
- Vite 6 with HMR support
- Tailwind CSS 4

## Technology Stack

- ⚡ **Electrobun** - Desktop app framework
- ⚛️ **React** - UI library
- 🎨 **Tailwind CSS** - Utility-first CSS
- 🔥 **Vite** - Build tool with HMR
- 🚀 **Turborepo** - Monorepo task runner
- 🥟 **Bun** - Runtime and package manager

## License

MIT
