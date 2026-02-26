# TypeScript / Bun Best Practices

## Module System
- The server package uses `"type": "module"` — always use ESM `import`/`export`. Never `require()`.
- Import Bun built-ins as `Bun.file()`, `Bun.write()`, etc. — do not import Node.js `fs`, `path`, `http`, or `net`.
- Use `import.meta.env` for env vars, not `process.env` (though both work in Bun — prefer `Bun.env`).

## Types — Be Explicit, No Implicit `any`

```typescript
// Bad
function handle(req, body) { ... }

// Good
function handle(req: Request, body: WingmanContext): Response { ... }
```

- Always type function parameters and return values for public exports.
- Use `satisfies` instead of `as` when asserting config shapes — it catches extra properties.
- Prefer `unknown` over `any` for untrusted data (parsed JSON); narrow with guards before use.

```typescript
// Bad
const settings = JSON.parse(raw) as WingmanSettings;

// Good
const raw: unknown = JSON.parse(text);
if (!isWingmanSettings(raw)) throw new Error("Invalid settings");
const settings = raw; // narrowed
```

## Async Patterns
- Always `await` promises. Never fire-and-forget without explicit error handling.
- Use `try/catch` around all I/O: file reads, HTTP fetches, server `listen()`.
- Never `await` inside a loop when calls are independent — use `Promise.all()`.

```typescript
// Bad
for (const item of items) await processItem(item);

// Good
await Promise.all(items.map(processItem));
```

## File I/O with Bun

```typescript
// Reading
const text = await Bun.file(path).text();

// Writing
await Bun.write(path, JSON.stringify(data, null, 2));

// Checking existence (Bun has no existsSync — use stat)
import { stat } from "fs/promises";
async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}
```

- Use `Utils.paths.userData` (from `electrobun/bun`) for the settings file path — never hardcode `~/Library/...`.
- Do not use `process.cwd()` for data paths — it changes depending on how the app is launched.

## Error Handling
- Every public async function should return a `Result` type or throw with a typed error — never swallow errors silently.
- Log errors to `console.error` with context before re-throwing or returning error responses.

## Naming Conventions
- **Files:** `kebab-case.ts`
- **Exported functions/classes:** `camelCase` functions, `PascalCase` classes
- **Types/interfaces:** `PascalCase`
- **Constants:** `SCREAMING_SNAKE_CASE` for true constants, `camelCase` for config values

## Bun HTTP Server — SSE & Routing

### Creating the Server

```typescript
const server = Bun.serve({
  port: 7891,
  fetch(req: Request): Response | Promise<Response> {
    return router(req);
  },
});
```

- `Bun.serve()` returns a `Server` object synchronously — it does not return a promise.
- The `fetch` handler must return a `Response` or `Promise<Response>` — never `void`.

### Routing — No Framework Needed

```typescript
async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;

  if (method === "GET" && url.pathname === "/health") return handleHealth();
  if (method === "POST" && url.pathname === "/context") return handleContext(req);
  if (method === "GET" && url.pathname === "/inline") return handleInline(req);
  // ...
  return new Response("Not Found", { status: 404 });
}
```

### SSE Responses

```typescript
function handleInline(req: Request): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Detect client disconnect
  req.signal.addEventListener("abort", () => {
    agent.abort();
    writer.close().catch(() => {});
  });

  // Start streaming (fire and forget — don't block the response)
  (async () => {
    const unsubscribe = agent.subscribe((event) => {
      if (event.type === "message_update") {
        const ev = event.assistantMessageEvent;
        if (ev.type === "text_delta") {
          writer.write(encoder.encode(`data: ${ev.delta}\n\n`));
        }
      }
      if (event.type === "agent_end" || event.type === "agent_start" /* error */) {
        writer.write(encoder.encode("data: [DONE]\n\n"));
        writer.close().catch(() => {});
        unsubscribe();
      }
    });
    try {
      await agent.prompt(buildFimPrompt(getContext()));
    } catch (err) {
      writer.write(encoder.encode(`data: [ERROR] ${String(err)}\n\n`));
      writer.close().catch(() => {});
      unsubscribe();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

### CORS — All Endpoints Need It

```typescript
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle OPTIONS preflight
if (req.method === "OPTIONS") {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
```

### Port Fallback and Port File

```typescript
async function startServer(): Promise<number> {
  for (const port of [7891, 0]) { // 0 = OS-assigned random
    try {
      const server = Bun.serve({ port, fetch: router });
      const chosenPort = server.port;
      await Bun.write(`${Utils.paths.temp}/wingman.port`, String(chosenPort));
      return chosenPort;
    } catch (err: unknown) {
      if (port === 0) throw err;
    }
  }
  throw new Error("unreachable");
}
```

### JSON Responses

```typescript
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
```

## pi-agent-core — Agent Usage

### Installation

```bash
bun add @mariozechner/pi-agent-core @mariozechner/pi-ai
```

### Correct Import and Instantiation

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a code assistant.",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
});
```

### getModel — Provider Strings Are Exact

The `getModel(provider, modelId)` function is typed. Use the exact provider string:
- `"anthropic"` — Claude models
- `"openai"` — GPT / o-series models
- `"google"` — Gemini models
- For Ollama / OpenAI-compatible: check `@mariozechner/pi-ai` docs

### Streaming SSE from Agent Events

```typescript
// CORRECT: subscribe before calling prompt()
const unsubscribe = agent.subscribe((event) => {
  if (event.type === "message_update") {
    const delta = event.assistantMessageEvent;
    if (delta.type === "text_delta") {
      writer.write(`data: ${delta.delta}\n\n`);
    }
  }
  if (event.type === "agent_end") {
    writer.write("data: [DONE]\n\n");
    writer.close();
    unsubscribe();
  }
});

// Start the agent (do NOT await if you need to return the stream first)
agent.prompt("Write a function that...").catch(console.error);
```

### Aborting In-Flight Runs

```typescript
agent.abort();
await agent.waitForIdle(); // always await before starting a new run
```

- Always call `waitForIdle()` after `abort()` before calling `prompt()` again.
- Set a timeout on `waitForIdle()` to avoid deadlocking:

```typescript
const timeout = new Promise<void>((_, reject) =>
  setTimeout(() => reject(new Error("abort timeout")), 2000)
);
await Promise.race([agent.waitForIdle(), timeout]);
```

### Reconfiguring the Agent

```typescript
// Change model without recreating the agent
agent.setModel(getModel("openai", "gpt-4o"));

// Change system prompt (takes effect on next turn)
agent.setSystemPrompt(buildSystemPrompt(context));

// Clear history for a fresh context
agent.clearMessages();
```

### Concurrent Request Guard

```typescript
let isStreaming = false;

async function runAgent(prompt: string, writer: WritableStreamDefaultWriter) {
  if (isStreaming) {
    agent.abort();
    await agent.waitForIdle();
  }
  isStreaming = true;
  // ... subscribe + prompt
  agent.subscribe((e) => {
    if (e.type === "agent_end") isStreaming = false;
  });
  await agent.prompt(prompt);
}
```

### Do NOT Store Agent State in Module Globals Carelessly

- Export a single agent instance from `apps/server/src/agent.ts`.
- All modules import from that file — never create multiple Agent instances.
