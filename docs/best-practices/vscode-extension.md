# VS Code Extension Best Practices (TypeScript)

## Extension Host Constraints

The extension host is NOT a browser and is NOT Bun. It is Node.js (specifically the VS Code extension host). Do NOT use:
- Browser APIs (`fetch` is available in modern VS Code, but `EventSource` may not be — use node-fetch or built-in `http`)
- Bun APIs (`Bun.serve`, `Bun.file`, etc.)
- DOM APIs

## Correct Fetch for SSE in Extension Host

VS Code's extension host has `fetch` available (Node 18+), but `EventSource` is not available. Use `fetch` with `ReadableStream`:

```typescript
import * as http from "http";

// For SSE from /inline — use Node's http.get for streaming
function openInlineStream(
  port: number, 
  onToken: (t: string) => void, 
  signal: AbortSignal
): void {
  const req = http.get(`http://localhost:${port}/inline`, (res) => {
    let buffer = "";
    res.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const token = line.slice(6).trim();
          if (token === "[DONE]") req.destroy();
          else onToken(token);
        }
      }
    });
  });
  signal.addEventListener("abort", () => req.destroy());
}
```

## Inline Completion Provider

VS Code's `InlineCompletionItemProvider` must return `InlineCompletionList` synchronously (or promptly from an async call). For streaming, collect the full result then return it.

```typescript
import * as vscode from "vscode";

class WingmanCompletionProvider implements vscode.InlineCompletionItemProvider {
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingReq: http.ClientRequest | null = null;

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | null> {
    // Cancel previous
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.pendingReq?.destroy();

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        if (token.isCancellationRequested) { resolve(null); return; }

        // Push context first
        const port = await getPort();
        await postContext(port, document, position);
        if (token.isCancellationRequested) { resolve(null); return; }

        // Collect inline completion
        let accumulated = "";
        await new Promise<void>((done) => {
          const ctrl = new AbortController();
          token.onCancellationRequested(() => ctrl.abort());
          openInlineStream(port, (t) => { accumulated += t; }, ctrl.signal);
          // When stream ends, done() is called inside the stream reader
        });

        resolve(
          new vscode.InlineCompletionList([
            new vscode.InlineCompletionItem(
              accumulated,
              new vscode.Range(position, position)
            ),
          ])
        );
      }, 300);
    });
  }
}
```

## CancellationToken — Always Respect It

```typescript
if (token.isCancellationRequested) return null;
token.onCancellationRequested(() => {
  abortController.abort();
});
```

## Spawning Subprocesses from Extension

```typescript
import * as cp from "child_process";
import * as path from "path";

function launchWingman(file: string, line: number, selection: string) {
  const appPath = "/Applications/Wingman.app/Contents/MacOS/wingman";
  cp.spawn(appPath, ["--file", file, "--line", String(line), "--selection", selection], {
    detached: true,
    stdio: "ignore",
  }).unref();
}
```

## Reading the Port File

```typescript
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

function getWingmanPort(): number {
  const portFile = path.join(os.tmpdir(), "wingman.port");
  try {
    return parseInt(fs.readFileSync(portFile, "utf8").trim(), 10);
  } catch {
    return 7891; // fallback default
  }
}
```

## Disposal / Cleanup

Register all disposables with `context.subscriptions.push(...)` so VS Code cleans them up on deactivate.

```typescript
export function activate(context: vscode.ExtensionContext) {
  const provider = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    new WingmanCompletionProvider()
  );
  context.subscriptions.push(provider);

  const polling = setInterval(pollWriteback, 2000);
  context.subscriptions.push({ dispose: () => clearInterval(polling) });
}

export function deactivate() {
  // subscriptions are cleaned up automatically
}
```

## package.json Structure

```json
{
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "commands": [
      { "command": "wingman.open", "title": "Wingman: Open" }
    ],
    "configuration": {
      "title": "Wingman",
      "properties": {
        "wingman.enabled": { "type": "boolean", "default": true },
        "wingman.inferencePort": { "type": "number", "default": 7891 }
      }
    }
  }
}
```

- `activationEvents: ["onStartupFinished"]` loads the extension after VS Code is ready.
- Do NOT use `"*"` as the activation event.
