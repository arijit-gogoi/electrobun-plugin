---
source: .cache/electrobun/kitchen/src/{bun,mainview,test-runner}/ + tests/rpc.test.ts
upstream_sha: 9e421ff2c9c987c6935aa1679348ec91e66b2af1
captured_at: 2026-05-17
---

# Typed RPC between Bun and webview

End-to-end typed RPC using a single shared interface.

## 1. The shared type

```ts
// src/shared/types.ts
export type AppRPC = {
  bun: {
    requests: {
      readFile: (a: { path: string }) => string;
      getUser:  (a: { id: number })   => { id: number; name: string };
      currentTime: () => number;
    };
    messages: {
      logToBun: (a: { level: "info" | "warn" | "error"; msg: string }) => void;
    };
  };
  webview: {
    requests: {
      getTitle: () => string;
      runJS:    (a: { code: string }) => unknown;
    };
    messages: {
      showAlert:   (a: { text: string }) => void;
      themeChange: (a: { theme: "light" | "dark" }) => void;
      progress:    (a: { jobId: string; pct: number }) => void;
    };
  };
};
```

- `bun.*` handlers live on the bun side, called from the webview.
- `webview.*` handlers live in the webview, called from bun.
- `requests` = awaitable. `messages` = fire-and-forget.

## 2. Bun side — define handlers, call into webview

```ts
// src/bun/index.ts
import { BrowserWindow, BrowserView } from "electrobun/bun";
import type { AppRPC } from "../shared/types";

const win = new BrowserWindow({
  url: "views://mainview/index.html",
  width: 1024,
  height: 768,
  rpc: BrowserView.defineRPC<AppRPC>({
    handlers: {
      requests: {
        readFile: async ({ path }) => await Bun.file(path).text(),
        getUser:  ({ id }) => ({ id, name: `User ${id}` }),
        currentTime: () => Date.now(),
      },
      messages: {
        logToBun: ({ level, msg }) => {
          console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](msg);
        },
      },
    },
  }),
});

// Call into the webview
setTimeout(async () => {
  const title = await win.webview.rpc.request.getTitle();
  console.log("webview title:", title);

  win.webview.rpc.send.showAlert({ text: "hi from bun" });

  // Stream progress
  for (let pct = 0; pct <= 100; pct += 10) {
    await new Promise(r => setTimeout(r, 100));
    win.webview.rpc.send.progress({ jobId: "job-1", pct });
  }
}, 1000);
```

## 3. Webview side — define handlers, call into Bun

```ts
// src/mainview/index.ts
import { Electroview } from "electrobun/view";
import type { AppRPC } from "../shared/types";

const rpc = Electroview.defineRPC<AppRPC>({
  handlers: {
    requests: {
      getTitle: () => document.title,
      runJS:    ({ code }) => {
        // eslint-disable-next-line no-eval
        return (0, eval)(code);
      },
    },
    messages: {
      showAlert:   ({ text }) => alert(text),
      themeChange: ({ theme }) => document.documentElement.dataset.theme = theme,
      progress:    ({ jobId, pct }) => {
        const el = document.getElementById(`progress-${jobId}`);
        if (el) el.textContent = `${pct}%`;
      },
    },
  },
});

const electroview = new Electroview({ rpc });

// Call into Bun
async function load() {
  const time = await electroview.rpc.request.currentTime();
  const user = await electroview.rpc.request.getUser({ id: 42 });

  electroview.rpc.send.logToBun({ level: "info", msg: `loaded at ${time}, user=${user.name}` });
}

load();
```

## 4. Common patterns

### Pattern: typed error response

`requests` return values are typed; for errors throw — they propagate as rejections on the caller.

```ts
// bun
requests: {
  readFile: async ({ path }) => {
    if (!path.startsWith("/safe/")) throw new Error("path not allowed");
    return await Bun.file(path).text();
  },
},

// webview
try {
  const text = await electroview.rpc.request.readFile({ path: "/etc/hosts" });
} catch (e) {
  console.error(e);   // "path not allowed"
}
```

### Pattern: bun → multiple webviews (broadcast)

```ts
// bun
for (const view of BrowserView.all()) {
  view.rpc?.send.themeChange({ theme: "dark" });
}
```

### Pattern: webview → another webview via bun

Bun is the broker. Webview A sends to bun; bun forwards to webview B:

```ts
// bun handler
requests: {
  forwardToWindow: ({ targetWindowId, msg }) => {
    const target = BrowserView.getById(targetWindowId);
    target?.rpc?.send.showAlert({ text: msg });
    return { ok: true };
  },
},
```

## Source paths

- `.cache/electrobun/package/src/shared/rpc.ts`
- `.cache/electrobun/package/src/bun/preload/{index,internalRpc,events}.ts`
- `.cache/electrobun/package/src/browser/index.ts` — `Electroview.defineRPC`
- `.cache/electrobun/kitchen/src/test-runner/rpc.ts`
- `.cache/electrobun/kitchen/src/tests/rpc.test.ts`
- `.cache/electrobun/kitchen/src/playgrounds/host-message/`
