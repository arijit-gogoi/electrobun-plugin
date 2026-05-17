---
source: .cache/electrobun/templates/multi-window/ + kitchen multiwindow-cef playground
upstream_sha: 9e421ff2c9c987c6935aa1679348ec91e66b2af1
captured_at: 2026-05-17
---

# Multiple windows — open, coordinate, close

Pattern for apps with multiple top-level windows that talk to each other through bun.

## Two windows, bun-mediated communication

```ts
// src/shared/types.ts
export type MultiRPC = {
  bun: {
    requests: {
      broadcast: (a: { text: string }) => { delivered: number };
    };
  };
  webview: {
    messages: {
      notice: (a: { text: string; from: string }) => void;
    };
  };
};
```

```ts
// src/bun/index.ts
import { BrowserWindow, BrowserView } from "electrobun/bun";
import type { MultiRPC } from "../shared/types";

const windows: BrowserWindow[] = [];

function defineRpc(label: string) {
  return BrowserView.defineRPC<MultiRPC>({
    handlers: {
      requests: {
        broadcast: ({ text }) => {
          let delivered = 0;
          for (const w of windows) {
            w.webview.rpc?.send.notice({ text, from: label });
            delivered++;
          }
          return { delivered };
        },
      },
    },
  });
}

const winA = new BrowserWindow({
  url: "views://mainview/index.html",
  width: 600, height: 400, x: 100, y: 100,
  title: "Window A",
  rpc: defineRpc("Window A"),
});
windows.push(winA);

const winB = new BrowserWindow({
  url: "views://mainview/index.html",
  width: 600, height: 400, x: 750, y: 100,
  title: "Window B",
  rpc: defineRpc("Window B"),
});
windows.push(winB);

// Sync close
winA.on("close", () => {
  if (!winB.isDestroyed?.()) winB.close();
});
winB.on("close", () => {
  if (!winA.isDestroyed?.()) winA.close();
});
```

```ts
// src/mainview/index.ts
import { Electroview } from "electrobun/view";
import type { MultiRPC } from "../shared/types";

const rpc = Electroview.defineRPC<MultiRPC>({
  handlers: {
    messages: {
      notice: ({ text, from }) => {
        const list = document.getElementById("notices")!;
        const li = document.createElement("li");
        li.textContent = `[${from}] ${text}`;
        list.appendChild(li);
      },
    },
  },
});

const electroview = new Electroview({ rpc });

document.getElementById("send")!.addEventListener("click", async () => {
  const text = (document.getElementById("input") as HTMLInputElement).value;
  const { delivered } = await electroview.rpc.request.broadcast({ text });
  console.log(`broadcast to ${delivered} windows`);
});
```

## Open a window on demand

```ts
import { BrowserWindow } from "electrobun/bun";

function openHelp() {
  return new BrowserWindow({
    url: "views://help/index.html",
    width: 800, height: 600,
    title: "Help",
  });
}

// e.g. from a menu click
ApplicationMenu.setMenu([
  { label: "Help", submenu: [
    { label: "Open Help", accelerator: "F1", click: openHelp },
  ]},
]);
```

## Stay alive with no windows (tray-only app)

```ts
// electrobun.config.ts
runtime: { exitOnLastWindowClosed: false }
```

Then explicitly call `Utils.quit()` to exit (e.g. from the tray menu).

## Source paths

- `.cache/electrobun/templates/multi-window/`
- `.cache/electrobun/kitchen/src/playgrounds/multiwindow-cef/`
- `.cache/electrobun/kitchen/src/tests/interactive/multiwindow-cef.test.ts`
- `.cache/electrobun/package/src/bun/core/BrowserWindow.ts`
