# React 19 / Vite Best Practices

## React 19 Changes — Do Not Use Deprecated Patterns

React 19 removes several patterns that were common in React 18 and earlier:

```typescript
// WRONG — React 19: ReactDOM.render is gone
ReactDOM.render(<App />, document.getElementById("root"));

// CORRECT
import { createRoot } from "react-dom/client";
createRoot(document.getElementById("root")!).render(<App />);
```

- `useEffect` cleanup functions must return `void` or a cleanup function — never return a promise directly.
- Use the `use()` hook for promises in React 19 where applicable, but for streaming SSE, stick to `useEffect` + `ReadableStream`.

## Fetch Streaming SSE in the Browser

```typescript
// Use fetch + ReadableStream, NOT EventSource (EventSource is GET-only)
async function streamGenerate(
  prompt: string, 
  onChunk: (t: string) => void, 
  signal: AbortSignal
) {
  const res = await fetch(`http://localhost:${port}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const token = line.slice(6);
        if (token === "[DONE]") return;
        onChunk(token);
      }
    }
  }
}
```

## AbortController for In-Flight Requests

```typescript
const abortRef = useRef<AbortController | null>(null);

function handleGenerate() {
  abortRef.current?.abort(); // cancel previous
  const controller = new AbortController();
  abortRef.current = controller;
  streamGenerate(prompt, onChunk, controller.signal).catch(console.error);
}

function handleStop() {
  abortRef.current?.abort();
  fetch(`http://localhost:${port}/abort`, { method: "POST" }); // also tell server
}

// Cleanup on unmount
useEffect(() => () => abortRef.current?.abort(), []);
```

## Polling with useEffect

```typescript
useEffect(() => {
  let active = true;
  const poll = async () => {
    try {
      const res = await fetch(`http://localhost:${port}/context`);
      if (res.ok) setContext(await res.json());
    } catch { /* server not ready */ }
    if (active) setTimeout(poll, 2000);
  };
  poll();
  return () => { active = false; };
}, [port]);
```

## Tailwind v4 — No Config File

The project uses Tailwind CSS v4 which has no `tailwind.config.js`. Configuration is done via CSS `@theme` directives:

```css
/* index.css */
@import "tailwindcss";

@theme {
  --color-primary: #6366f1;
  --font-sans: "Inter", sans-serif;
}
```

- Do not create `tailwind.config.js` — it's not used in v4.
- Use standard utility class names; custom values go through CSS variables.

## Component Structure

- One component per file. File name matches component name (PascalCase).
- Co-locate styles with components using Tailwind classes — no separate CSS files per component.
- Extract hooks into `src/hooks/` with the `use` prefix.
