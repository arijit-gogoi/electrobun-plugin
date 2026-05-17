---
name: electrobun-ipc-rpc
description: Typed RPC between the Bun main process and webview renderers. Covers `Electroview.defineRPC`, `BrowserView.defineRPC`, the four preload bridges (event, internal, host, bun), sandboxed preloads, host messages, and the underlying Socket + WebSocket + executeJavascript transports. Use when the user asks about IPC, sending messages between bun and webview, typing RPC handlers, preload scripts, or `contextBridge`-equivalent setups.
---

# IPC / RPC — typed bun ↔ webview messaging

**Electron analogs:**
- `ipcMain.handle` + `ipcRenderer.invoke` → `Electroview.defineRPC` / `BrowserView.defineRPC` (typed end-to-end via TS)
- `contextBridge.exposeInMainWorld` → preload bridges (already exposed as `__electrobun*` globals)
- `webContents.send` → `webview.rpc.send.X({...})` (fire-and-forget) or `.request.X({...})` (awaitable)

Key win over Electron: types are end-to-end with **one shared interface**. No more drifting `ipcRenderer.invoke('foo', ...)` strings.

## The shared type — start here

```ts
// src/shared/types.ts
export type MyRPC = {
  bun: {
    requests: {
      readFile: (a: { path: string }) => string;
      getUser:  (a: { id: number })   => { id: number; name: string };
    };
    messages: {
      logToBun: (a: { msg: string }) => void;
    };
  };
  webview: {
    requests: {
      getTitle: () => string;
    };
    messages: {
      showAlert:  (a: { text: string }) => void;
      themeChange: (a: { theme: "light" | "dark" }) => void;
    };
  };
};
```

- `requests` = await-able (return a value)
- `messages` = fire-and-forget (no response)
- `bun.*` = handlers that LIVE on the bun side, called FROM the webview
- `webview.*` = handlers that LIVE in the webview, called FROM bun

Same type imported on both sides → compile-time errors if signatures drift.

## Bun side — define + use

```ts
// src/bun/index.ts
import { BrowserWindow, BrowserView } from "electrobun/bun";
import type { MyRPC } from "../shared/types";

const win = new BrowserWindow({
  url: "views://mainview/index.html",
  rpc: BrowserView.defineRPC<MyRPC>({
    handlers: {
      requests: {
        readFile: async ({ path }) => Bun.file(path).text(),
        getUser:  ({ id }) => ({ id, name: "Ari" }),
      },
      messages: {
        logToBun: ({ msg }) => console.log("from webview:", msg),
      },
    },
  }),
});

// Call into the webview
const title  = await win.webview.rpc.request.getTitle();
win.webview.rpc.send.showAlert({ text: "hi" });
win.webview.rpc.send.themeChange({ theme: "dark" });
```

## Webview side — define + use

```ts
// src/mainview/index.ts
import { Electroview } from "electrobun/view";
import type { MyRPC } from "../shared/types";

const rpc = Electroview.defineRPC<MyRPC>({
  handlers: {
    requests: {
      getTitle: () => document.title,
    },
    messages: {
      showAlert:   ({ text }) => alert(text),
      themeChange: ({ theme }) => document.documentElement.dataset.theme = theme,
    },
  },
});

const electroview = new Electroview({ rpc });

// Call into Bun
const fileContents = await electroview.rpc.request.readFile({ path: "/etc/hosts" });
const user         = await electroview.rpc.request.getUser({ id: 42 });

// Fire-and-forget to Bun
electroview.rpc.send.logToBun({ msg: "hello from browser" });
```

## How it actually works (the 4 preload bridges)

When a webview boots, the preload script injects four globals into `window`:

| Global | What it carries | Source |
|---|---|---|
| `window.__electrobunEventBridge` | one-way events from bun to all webviews | `package/src/bun/preload/events.ts` |
| `window.__electrobunInternalBridge` | RPC for trusted internal traffic | `package/src/bun/preload/internalRpc.ts` |
| `window.__electrobunHostBridge` | user RPC (your `defineRPC`) — trusted | `package/src/bun/preload/index.ts` |
| `window.__electrobunBunBridge` | legacy bridge, kept for back-compat | `package/src/bun/preload/index.ts` |

The `HostBridge` is what `Electroview.defineRPC` wires up. `EventBridge` carries broadcasts. `InternalBridge` is used by electrobun itself for things like webview-tag resize sync.

## Sandboxed preloads (limited bridge surface)

```ts
new BrowserWindow({
  url: "views://untrusted/index.html",
  sandbox: true,    // verify exact key in BrowserWindow.ts
});
```

A sandboxed webview only gets the **EventBridge** — no RPC, no encryption, no webview-tag support. Use this for any view loading third-party HTML or untrusted content.

Source: `.cache/electrobun/package/src/bun/preload/index-sandboxed.ts` — the sandboxed preload only initialises lifecycle, cmd-click, SPA navigation, and overscroll. No RPC.

## Transport details

Default: WebSocket with **per-webview AES-GCM encryption** (`package/src/bun/core/Socket.ts`). Fallback: `executeJavascript` injection if WebSocket isn't available.

Internal RPC batches messages with a `2 ms` `setTimeout` to work around a Bun JSCallback threading issue (`package/src/bun/preload/internalRpc.ts`). `request()` has a 10 s timeout — if your handler does heavy work, return early and stream results via `messages`.

## Host messages — webview tag → parent → bun

`<electrobun-webview>` tags can post messages up to their parent webview:

```ts
// Inside a child webview (loaded via <electrobun-webview>)
window.postMessage({ kind: "hello" }, "*");
```

```ts
// In the parent webview's JS
const childTag = document.getElementById("child") as ElectrobunWebviewTag;
childTag.addEventListener("electrobun-host-message", (e) => {
  console.log("from child:", (e as CustomEvent).detail);
});
```

Then forward to bun via your normal RPC if needed. Playground: `.cache/electrobun/kitchen/src/playgrounds/host-message/`.

## Broadcasts (one bun, many webviews)

```ts
// From bun — broadcast to every BrowserView
for (const view of BrowserView.all()) {
  view.rpc?.send.themeChange({ theme: "dark" });
}
```

If you have many webviews and want true broadcast (single packet), the `EventBridge` path is more efficient — though the user-facing surface is currently per-view.

## Common patterns

### Pattern: streaming progress

```ts
// shared types
type MyRPC = {
  webview: {
    messages: {
      progress: (a: { jobId: string; pct: number }) => void;
    };
  };
};

// bun side
async function runJob(jobId: string, view: BrowserView) {
  for (let pct = 0; pct <= 100; pct += 10) {
    await new Promise(r => setTimeout(r, 100));
    view.rpc?.send.progress({ jobId, pct });
  }
}
```

### Pattern: request with side-effect

```ts
// shared
type MyRPC = {
  bun: {
    requests: { saveSettings: (a: { json: string }) => { ok: boolean; savedAt: number } };
  };
};

// bun
requests: {
  saveSettings: async ({ json }) => {
    await Bun.write("settings.json", json);
    return { ok: true, savedAt: Date.now() };
  },
},
```

### Pattern: cross-window communication

```ts
// bun is the broker
const winA = new BrowserWindow({ rpc: BrowserView.defineRPC<MyRPC>({ ... }) });
const winB = new BrowserWindow({ rpc: BrowserView.defineRPC<MyRPC>({ ... }) });

// In winA's handler, send to winB
requests: {
  pingOtherWindow: () => {
    winB.webview.rpc?.send.alert({ text: "ping" });
    return "sent";
  },
},
```

## Gotchas

1. **`rpc.request.X` returns a Promise.** Always `await`. If you forget, you get `Promise { ... }` printed instead of the value.
2. **Don't put DOM types in shared `MyRPC` type.** They're not available on the bun side. Use serializable shapes (strings, numbers, objects, arrays).
3. **`messages` are fire-and-forget.** No delivery guarantee, no error propagation. Use `requests` if you need acknowledgement.
4. **Sandboxed = no RPC.** If RPC isn't working, check the view isn't sandboxed.
5. **WebSocket port conflict.** Each webview gets its own. If a corporate proxy interferes, you'll see fallback to `executeJavascript`. Slower but works.
6. **10 s request timeout.** Long-running handlers should return immediately and stream progress via `messages`.

## Cited from

- `.cache/electrobun/package/src/shared/rpc.ts` — `createRPC` + `defineElectrobunRPC`
- `.cache/electrobun/package/src/bun/preload/{index,index-sandboxed,events,internalRpc}.ts`
- `.cache/electrobun/package/src/bun/core/Socket.ts` — WebSocket + AES-GCM transport
- `.cache/electrobun/package/src/browser/index.ts` — `Electroview` + `defineRPC`
- `.cache/electrobun/docs/src/content/docs/electrobun/apis/browser/electroview-class.mdx`
- `.cache/electrobun/kitchen/src/playgrounds/host-message/`
- `.cache/electrobun/kitchen/src/tests/rpc.test.ts`
