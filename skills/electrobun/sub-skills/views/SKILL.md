---
name: electrobun-views
description: BrowserWindow, BrowserView, navigation, devtools, window events, in-page search, navigation rules, custom titlebars, transparent windows, and the `<electrobun-webview>` OOPIF tag. Use when the user asks about creating or controlling windows and webviews, handling navigation events, opening devtools, embedding sub-webviews, or anything about the visible UI surface of an Electrobun app.
---

# Views — BrowserWindow, BrowserView, and the webview tag

**Electron analogs:**
- `BrowserWindow` → `BrowserWindow` (native window — same name, slightly different API)
- `BrowserView` / `WebContentsView` → `BrowserView` (the webview instance)
- `<webview>` tag → `<electrobun-webview>` (true OOPIF, not deprecated like Electron's)

## Mental model

- **`BrowserWindow`** = the OS window (frame, chrome, position). Owns one default `BrowserView` (`win.webview`) plus any extra views composited into it.
- **`BrowserView`** = a webview process (system webview by default, CEF if `bundleCEF: true`). Has navigation, executeJavascript, RPC, events.
- **`<electrobun-webview>`** = an OOPIF embedded inside a webview's HTML. Real cross-origin process isolation, native compositing — not a magic iframe.

Source: `.cache/electrobun/package/src/bun/core/{BrowserWindow,BrowserView}.ts`. Custom-element source: `.cache/electrobun/package/src/browser/{webviewtag,wgputag}.ts`.

## Open a window

```ts
import { BrowserWindow } from "electrobun/bun";

const win = new BrowserWindow({
  url: "views://mainview/index.html",
  width: 1024,
  height: 768,
  title: "My App",
});
```

Common options (cite `.cache/electrobun/package/src/bun/core/BrowserWindow.ts` for the full type):

| Option | What it does |
|---|---|
| `url` | initial URL (`views://...`, `https://...`, `file://...`) |
| `width` / `height` | initial size in CSS px |
| `x` / `y` | initial position; omit for OS default |
| `title` | window title |
| `frame: false` | borderless (use `setMovable` + draggable regions) |
| `transparent: true` | transparent background; pair with `frame: false` |
| `alwaysOnTop: true` | float above other windows |
| `resizable: false` | lock size |
| `visibleOnAllWorkspaces: true` | macOS spaces / Linux workspaces |
| `rpc` | typed RPC handlers (see [`ipc-rpc`](../ipc-rpc/SKILL.md)) |

## Window methods

```ts
win.close();                       // close + fire close event
win.hide();                        // hide without close (v1.18.0+)
win.show();
win.focus();
win.setBounds({ x, y, width, height });
win.setTitle("Updated");
win.setVisibleOnAllWorkspaces(true);
win.beginWindowMove();             // start native drag (call in mousedown)
```

## Window events

```ts
win.on("close",                  () => console.log("closing"));
win.on("blur",                   () => console.log("lost focus"));
win.on("focus",                  () => console.log("got focus"));
win.on("move",                   (e) => console.log(e.detail.x, e.detail.y));
win.on("resize",                 (e) => console.log(e.detail.width, e.detail.height));
```

Cancellable events (return `{ allow: false }` from handler to veto):
- `beforeQuit` — globally cancellable via `Electrobun.events.app.on("beforeQuit", ...)`

For window resize / blur / focus playgrounds, see `.cache/electrobun/kitchen/src/playgrounds/window-events-{move-resize,blur-focus}/`.

## BrowserView (the webview inside a window)

```ts
import { BrowserWindow, BrowserView } from "electrobun/bun";

const win = new BrowserWindow({ url: "views://main/index.html" });
const webview = win.webview;       // default view

// Or look up any view by id
const view = BrowserView.getById(webview.id);
```

## Navigation

```ts
webview.loadURL("https://example.com");
webview.loadURL("views://mainview/page2.html");
webview.loadHTML("<html><body><h1>Inline</h1></body></html>");
webview.goBack();
webview.goForward();
webview.canGoBack();
webview.canGoForward();
webview.reload();
```

## Navigation rules — block at native layer

```ts
webview.setNavigationRules([
  "^*",                             // ^ prefix = DENY (deny everything by default)
  "*://en.wikipedia.org/*",         // allow
  "*://upload.wikimedia.org/*",
]);
```

Rules are glob patterns evaluated **in native C++** (`.cache/electrobun/package/src/native/shared/navigation_rules.h`). No JS round-trip per request. Last match wins. `^` prefix = deny. Use this for: ad/tracker blocking, sandboxing untrusted content, kiosk-mode lockdown.

**Electron analog:** `webRequest.onBeforeRequest` with `cancel: true`. Difference: electrobun rules are static + native + fast; Electron rules are dynamic + JS + slow.

## DevTools

```ts
webview.openDevTools();
webview.toggleDevTools();
webview.closeDevTools();
```

Auto-opens when `process.env.NODE_ENV === "development"` if you choose to wire it that way — there's no auto-open by default in electrobun.

## Execute JS

```ts
// Fire and forget
webview.executeJavascript('document.title = "patched"');

// With response (requires RPC defined — see ipc-rpc sub-skill)
const title = await webview.rpc.request.evaluateJavascriptWithResponse({
  script: "document.title",
});
```

## Zoom

```ts
webview.setPageZoom(1.25);
const z = webview.getPageZoom();    // 1.25
```

Added in v1.16.0 (see `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-16-0.mdx`).

## In-page search

```ts
webview.findInPage("hello", { forward: true, matchCase: false });
webview.findInPage("hello", { forward: false });   // backward
webview.stopFindInPage();
```

Playground: `.cache/electrobun/kitchen/src/playgrounds/webviewtag/find-test.html`.

## Webview events

```ts
webview.on("will-navigate",        (e) => /* e.data.url, e.data.allowed */);
webview.on("did-navigate",         (e) => /* e.data.detail */);
webview.on("did-navigate-in-page", (e) => /* SPA route change */);
webview.on("dom-ready",            () => /* DOM ready */);
webview.on("new-window-open",      (e) => /* e.detail.url — popup attempt */);

webview.on("download-started",   (e) => /* e.detail.filename */);
webview.on("download-progress",  (e) => /* e.detail.progress 0-100 */);
webview.on("download-completed", (e) => /* e.detail.path */);
webview.on("download-failed",    (e) => /* e.detail.error */);
```

`will-navigate.data.allowed` already reflects the navigation rules — if `false`, native already blocked it. Use this for logging, not for blocking (rules do that).

## `<electrobun-webview>` — embed a webview in HTML

```html
<!-- inside your view's HTML -->
<electrobun-webview
  id="docs"
  src="https://example.com"
  style="width: 600px; height: 400px;"
></electrobun-webview>
```

```ts
// From the parent view's JS
const tag = document.getElementById("docs") as ElectrobunWebviewTag;
tag.executeJavascript('document.body.style.background = "red"');
tag.setNavigationRules(["^*", "*://example.com/*"]);
tag.toggleDevTools();
tag.findInPage("term");
tag.setTransparent(true);
tag.setPassthrough(true);     // mouse events pass through to parent
tag.setHidden(true);
```

`<electrobun-webview>` is a real OOPIF — separate process, separate origin, true sandbox. **Not deprecated** like Electron's `<webview>` tag. See `.cache/electrobun/docs/src/content/docs/electrobun/guides/architecture/webview-tag.mdx` for the rationale.

Source: `.cache/electrobun/package/src/browser/webviewtag.ts`. Native compositing via OverlaySync between parent webview and native window (`.cache/electrobun/package/src/bun/preload/overlaySync.ts`).

Playground: `.cache/electrobun/kitchen/src/playgrounds/webviewtag/`.

## Multiple windows

```ts
const a = new BrowserWindow({ url: "views://main/index.html", width: 800 });
const b = new BrowserWindow({ url: "views://aux/index.html",  width: 400 });

a.on("close", () => b.close());     // close aux when main closes
```

By default the app stays alive while any window is open. Override with `runtime.exitOnLastWindowClosed: false` in `electrobun.config.ts` to keep the app running with zero windows (e.g. tray-only apps).

## Custom titlebar

Borderless + transparent + draggable regions = custom chrome:

```ts
const win = new BrowserWindow({
  url: "views://main/index.html",
  frame: false,
  transparent: true,
  width: 800, height: 600,
});
```

```html
<!-- in your view -->
<style>
  .titlebar { -electrobun-app-region: drag; height: 32px; }
  .titlebar button { -electrobun-app-region: no-drag; }
</style>
<div class="titlebar">My App <button>×</button></div>
```

The `-electrobun-app-region: drag` CSS property marks regions the OS treats as window-drag handles. See `.cache/electrobun/package/src/bun/preload/dragRegions.ts` + `.cache/electrobun/kitchen/src/playgrounds/custom-titlebar/`.

## Transparent / passthrough windows

```ts
const overlay = new BrowserWindow({
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  width: 400, height: 200,
});
```

For mouse-passthrough (clicks pass through to whatever's below), set `setPassthrough(true)` on a `<electrobun-webview>` tag or window-level passthrough APIs in `webview-settings/`. Playground: `kitchen/src/playgrounds/transparent-window/`.

## Renderer settings (per-view)

```ts
new BrowserWindow({
  url: "views://main/index.html",
  renderer: "system",          // "system" (default) | "cef"
});
```

Or set the default per-platform in `electrobun.config.ts`:

```ts
mac: { defaultRenderer: "cef", bundleCEF: true },
```

`bundleCEF: true` ships a pinned Chromium with your app (~150 MB). Without it, electrobun uses the system webview (WebKit on mac, WebView2 on win, WebKit2GTK on linux). System webview = ~14 MB total bundle. See [`build-dist`](../build-dist/SKILL.md).

## Common questions

**Q: How do I open an external link in the user's default browser?**
```ts
webview.on("new-window-open", e => {
  Electrobun.shell?.openExternal(e.detail.url);  // verify: grep .cache/electrobun for openExternal
});
```
If `shell.openExternal` isn't exposed, use `Bun.spawn(["open", url])` on macOS, `xdg-open` on Linux, `start` on Windows. Check upstream — API surface is still evolving.

**Q: Why doesn't `window.alert()` work in my view?**
System webviews disable default `alert/confirm/prompt` by default. Use a custom UI dialog, or wire it through RPC to the bun side which can show a native dialog via `Electrobun.dialog.*`.

**Q: How do I show a context menu?**
See [`system-integration`](../system-integration/SKILL.md) for `ContextMenu`.

## Cited from

- `.cache/electrobun/package/src/bun/core/BrowserWindow.ts`
- `.cache/electrobun/package/src/bun/core/BrowserView.ts`
- `.cache/electrobun/package/src/browser/{index,webviewtag}.ts`
- `.cache/electrobun/package/src/bun/preload/{dragRegions,overlaySync}.ts`
- `.cache/electrobun/package/src/native/shared/navigation_rules.h`
- `.cache/electrobun/docs/src/content/docs/electrobun/apis/browser-{window,view}.mdx`
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/architecture/webview-tag.mdx`
- `.cache/electrobun/kitchen/src/playgrounds/{custom-titlebar,transparent-window,webviewtag,webview-settings,window-events-move-resize,window-events-blur-focus}/`
