---
source: context7 — /blackboardsh/electrobun (1104 snippets, score 84.4)
upstream_sha: 9e421ff2c9c987c6935aa1679348ec91e66b2af1
upstream_version: 1.18.4-beta.3
captured_at: 2026-05-17
refresh_via: bun run scripts/refresh-refs.ts
---

# Electrobun — context7 API Cheatsheet

Pre-cached "minimum viable" snippets. For anything beyond, call
`mcp__context7__query-docs libraryId="/blackboardsh/electrobun" query="..."` live.

## 1. Bootstrap a new app

```bash
bunx electrobun init
cd my-app
bun install
bun start
```

Project layout after `init`:

```
my-app/
  electrobun.config.ts        # build config (see Build sub-skill)
  src/bun/index.ts            # main process entry
  src/mainview/index.ts       # default view (browser-side)
  src/mainview/index.html
```

## 2. Open a window

```ts
// src/bun/index.ts
import { BrowserWindow } from "electrobun/bun";

const win = new BrowserWindow({
  url: "views://mainview/index.html",
  width: 1024,
  height: 768,
});
```

The `views://` scheme resolves to entry points declared under `build.views` in `electrobun.config.ts`.

## 3. BrowserView — webview management

```ts
import { BrowserWindow, BrowserView } from "electrobun/bun";

const win = new BrowserWindow({ url: "views://main/index.html" });
const webview = win.webview;

// Or look up by id
const view = BrowserView.getById(webview.id);

// Navigate
webview.loadURL("https://example.com");
webview.loadURL("views://mainview/page2.html");
webview.loadHTML("<html><body><h1>Dynamic HTML</h1></body></html>");

// Fire-and-forget JS
webview.executeJavascript('document.title = "patched"');

// JS with response (needs RPC)
const title = await webview.rpc.request.evaluateJavascriptWithResponse({
  script: "document.title",
});

// Zoom
webview.setPageZoom(1.25);
webview.getPageZoom(); // 1.25

// Navigation rules — evaluated in native C++, no JS round-trip
webview.setNavigationRules([
  "^*",                       // block-by-default (^ prefix = deny)
  "*://en.wikipedia.org/*",   // allow
  "*://upload.wikimedia.org/*",
]);

// In-page search
webview.findInPage("hello", { forward: true, matchCase: false });
webview.findInPage("hello", { forward: false });
webview.stopFindInPage();

// DevTools
webview.openDevTools();
webview.toggleDevTools();
webview.closeDevTools();

// Download events
webview.on("download-started",   (e) => console.log("started:",  e.detail.filename));
webview.on("download-progress",  (e) => console.log("progress:", e.detail.progress + "%"));
webview.on("download-completed", (e) => console.log("saved:",    e.detail.path));
webview.on("download-failed",    (e) => console.log("failed:",   e.detail.error));

// Navigation events
webview.on("will-navigate",        (e) => console.log("navigating:", e.data.url, "allowed:", e.data.allowed));
webview.on("did-navigate",         (e) => console.log("navigated:",  e.data.detail));
webview.on("did-navigate-in-page", (e) => console.log("in-page:",    e.data.detail));
webview.on("dom-ready",            ()  => console.log("DOM ready"));
webview.on("new-window-open",      (e) => console.log("new window:", e.detail.url));
```

## 4. Typed RPC (Electroview side)

```ts
// src/shared/types.ts
export type MyRPC = {
  bun: {
    requests: { readFile: (a: { path: string }) => string };
    messages: { logToBun: (a: { msg: string }) => void };
  };
  webview: {
    requests: { getTitle: () => string };
    messages: { showAlert: (a: { text: string }) => void };
  };
};

// src/mainview/index.ts
import { Electroview } from "electrobun/view";
import type { MyRPC } from "../shared/types";

const rpc = Electroview.defineRPC<MyRPC>({
  handlers: {
    requests: { getTitle: () => document.title },
    messages: { showAlert: ({ text }) => alert(text) },
  },
});

const electroview = new Electroview({ rpc });

// Call into Bun
const fileContents = await electroview.rpc.request.readFile({ path: "/etc/hosts" });

// Fire-and-forget to Bun
electroview.rpc.send.logToBun({ msg: "hello from browser" });
```

## 5. Typed RPC (Bun side)

```ts
// src/bun/index.ts
import { BrowserWindow, BrowserView } from "electrobun/bun";
import type { MyRPC } from "../shared/types";

const win = new BrowserWindow({
  url: "views://mainview/index.html",
  rpc: BrowserView.defineRPC<MyRPC>({
    handlers: {
      requests: { readFile: async ({ path }) => Bun.file(path).text() },
      messages: { logToBun: ({ msg }) => console.log("from webview:", msg) },
    },
  }),
});

// Call into webview
const title = await win.webview.rpc.request.getTitle();
win.webview.rpc.send.showAlert({ text: "hi" });
```

## 6. electrobun.config.ts (build configuration)

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "My App",
    identifier: "com.example.my-app",
    version: "0.1.0",
    urlSchemes: ["myapp"],
  },
  build: {
    mainProcess: "bun",          // or "zig"
    bun:  { entrypoint: "src/bun/index.ts" },
    views: {
      mainview:   { entrypoint: "src/mainview/index.ts" },
      webviewtag: { entrypoint: "src/webviewtag/index.ts" },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css":  "views/mainview/index.css",
    },
    mac: {
      codesign: true,
      notarize: true,
      bundleCEF: true,
      defaultRenderer: "cef",
      entitlements: {
        "com.apple.security.device.camera":     "Camera for video features",
        "com.apple.security.device.microphone": "Microphone for audio features",
      },
      icons: "App.icon",   // or "icon.iconset"
    },
    linux: { bundleCEF: true, defaultRenderer: "cef" },
    win:   { bundleCEF: true, defaultRenderer: "cef" },
  },
  scripts: {
    postBuild: "./buildScript.ts",
  },
  release: {
    baseUrl: "https://static.example.com/my-app/",
  },
} satisfies ElectrobunConfig;
```

## 7. Live context7 recipes

```text
# Pull more snippets on a specific topic
mcp__context7__query-docs libraryId="/blackboardsh/electrobun" query="<your topic>"

# If unsure of the right id
mcp__context7__resolve-library-id libraryName="electrobun" query="<task>"
```

Alternate ids worth knowing:
- `/blackboardsh/electrobun` — 1104 snippets, score 84.4 (canonical)
- `/websites/blackboard_sh_electrobun` — 735 snippets, mirrors site
- `/llmstxt/blackboard_sh_electrobun_llms_txt` — 53 condensed snippets, score 94.5 (highest density)
