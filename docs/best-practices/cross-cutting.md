# Cross-Cutting Best Practices

## Secrets / API Keys — Never in Source Code or Env Files

- The API key lives in the settings JSON file in `Utils.paths.userData`.
- Never commit `.env` files or hardcode keys in any source file.
- The settings file path must never end up in logs or error messages.

## HTTP Error Handling — Always Check Status

```typescript
// WRONG
const data = await (await fetch(url)).json();

// CORRECT
const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
const data: unknown = await res.json();
```

## Port File Race Condition

Extensions may read `$TMPDIR/wingman.port` before the server has written it (first launch). Always have a fallback:

```typescript
// extension side
async function getPort(): Promise<number> {
  // Try reading the port file up to 5 times, 200ms apart
  for (let i = 0; i < 5; i++) {
    try {
      const port = parseInt(await fs.promises.readFile(portFile, "utf8"), 10);
      if (!isNaN(port)) return port;
    } catch {}
    await sleep(200);
  }
  return 7891; // last-resort default
}
```

## SSE Token Format — Be Consistent

The server always sends:
```
data: <token text>\n\n
data: [DONE]\n\n
```

No JSON wrapping, no `event:` line. Clients split on `\n`, take lines starting with `data: `, strip the prefix.

## Newlines in SSE Tokens

Tokens from LLMs can contain newlines. Use JSON encoding for the data field:

```typescript
// Server — encode token to avoid SSE frame corruption
writer.write(encoder.encode(`data: ${JSON.stringify(delta)}\n\n`));

// Client — decode
const token = JSON.parse(line.slice(6)); // JSON.parse handles escaped newlines
```

## No `console.log` in Production Paths

Use `console.error` for errors, `console.warn` for recoverable issues. Remove or gate verbose `console.log` behind a `DEBUG` flag.

## File Naming Consistency

| Layer | Convention |
|-------|-----------|
| Bun server files | `kebab-case.ts` |
| React components | `PascalCase.tsx` |
| React hooks | `use-kebab-case.ts` or `useCamelCase.ts` |
| Kotlin files | `PascalCase.kt` |
| Rust files | `snake_case.rs` |
| Extension dirs | `extensions/vscode/`, `extensions/intellij/`, `extensions/zed/` |

## Don't Over-Engineer for MVP

- No database — JSON file for settings.
- No auth middleware — localhost only.
- No message queue — synchronous HTTP polling is fine.
- No ORM — no database.
- One `Agent` instance — no pooling.
- Resist adding abstraction layers that aren't needed by any current task.
