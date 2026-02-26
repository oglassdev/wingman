# Electrobun Best Practices

## Import Correctly — This is NOT Electron

```typescript
// CORRECT
import { BrowserWindow, Tray, Utils } from "electrobun/bun";
import Electrobun from "electrobun/bun";

// WRONG — these do not exist in Electrobun
import { app, ipcMain, BrowserWindow } from "electron";
```

## IPC — Use Typed RPC, Not Raw Event Strings

Electrobun's IPC is typed end-to-end via a shared schema in `src/shared/types.ts`. Define it once, import it in both the bun process and the browser view.

```typescript
// src/shared/types.ts
import type { RPCSchema } from "electrobun/bun";

export type WingmanRPC = {
  bun: RPCSchema<{
    requests: {
      "settings:read": { params: {}; response: WingmanSettings };
      "settings:write": { params: WingmanSettings; response: { ok: boolean } };
    };
    messages: {
      "ui:context-update": WingmanContext;
    };
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {};
  }>;
};

// Bun side — attach rpc to BrowserView.defineRPC, then pass to BrowserWindow
const rpc = BrowserView.defineRPC<WingmanRPC>({
  handlers: {
    requests: {
      "settings:read": async () => loadSettings(),
      "settings:write": async (settings) => { 
        await saveSettings(settings); 
        return { ok: true }; 
      },
    },
    messages: {},
  },
});
const win = new BrowserWindow({ url: "views://mainview/index.html", rpc });

// Browser side — use Electroview
import { Electroview } from "electrobun/view";
const rpc = Electroview.defineRPC<WingmanRPC>({ handlers: { requests: {}, messages: {} } });
const ev = new Electroview({ rpc });
const settings = await ev.rpc.request["settings:read"]({});
```

### Never Use String-Based IPC

```typescript
// WRONG — Electrobun does not have ipcMain/ipcRenderer
ipcMain.on("settings:read", handler);
ipcRenderer.send("settings:read");

// CORRECT — typed RPC as shown above
```

## Window Lifecycle

- Use `win.on("close", ...)` to intercept close — hide the window instead of letting it close, to keep the process alive.
- Use `Tray` for the menu bar icon; use `tray.on("tray-item-clicked", ...)` for quit.
- Never call `process.exit()` directly from UI code — send a message through IPC and call `Utils.quit()` from Bun.

```typescript
// Keep process alive when window closes
win.on("close", (e) => {
  win.setFrame(-10000, -10000, 0, 0); // move offscreen
});

tray.on("tray-item-clicked", (e) => {
  if (e.data.action === "quit") Utils.quit();
  if (e.data.action === "show") win.focus();
});
```

## Paths — Always Use Electrobun's Path Helpers

```typescript
import { Utils } from "electrobun/bun";

// Correct: scoped to app identity + channel
const settingsPath = `${Utils.paths.userData}/wingman-settings.json`;
const portFilePath = `${Utils.paths.temp}/wingman.port`;

// WRONG
const settingsPath = `${process.env.HOME}/Library/Application Support/wingman-settings.json`;
```

## Tray Image

- Provide a tray icon asset at `apps/client/dist/assets/icon-template.png` (or similar). 
- Mark `template: true` on macOS — this makes the icon adapt to light/dark menu bar automatically.
- If the asset isn't built yet, use a text title (`title: "W"`) as placeholder.

## before-quit — Not process.on('exit')

```typescript
// CORRECT
Electrobun.events.on("before-quit", async (e) => {
  await inferenceServer.stop();
});

// WRONG — does not fire in Electrobun
process.on("beforeExit", cleanup);
process.on("exit", cleanup);
```

## Electroview / Electrobun IPC in the Browser

```typescript
// Browser side — ONLY way to talk to Bun process
import { Electroview } from "electrobun/view";
import type { WingmanRPC } from "../../shared/types";

const rpc = Electroview.defineRPC<WingmanRPC>({
  handlers: { requests: {}, messages: {} },
});
const electroview = new Electroview({ rpc });

// Usage in a hook
const settings = await electroview.rpc.request["settings:read"]({});
```

- Create the `Electroview` instance **once** at the module level or in a stable context — do not re-instantiate it on every render.
- Do not put `Electroview` in a `useState` call; put it in a `useRef` or module singleton.
