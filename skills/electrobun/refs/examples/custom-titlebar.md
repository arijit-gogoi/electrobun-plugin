---
source: .cache/electrobun/kitchen/src/playgrounds/custom-titlebar/
upstream_sha: 9e421ff2c9c987c6935aa1679348ec91e66b2af1
captured_at: 2026-05-17
---

# Custom titlebar — frameless window with draggable regions

For apps that want full visual control over the window chrome (e.g. notes apps, browsers, editors).

## Bun side

```ts
// src/bun/index.ts
import { BrowserWindow } from "electrobun/bun";

new BrowserWindow({
  url: "views://mainview/index.html",
  width: 1024,
  height: 720,
  frame: false,           // remove OS chrome
  transparent: true,      // allow rounded corners
});
```

## View HTML

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="index.css" />
    <script type="module" src="index.ts"></script>
  </head>
  <body>
    <div class="titlebar">
      <div class="titlebar-drag">My App</div>
      <div class="titlebar-buttons">
        <button id="min">–</button>
        <button id="max">▢</button>
        <button id="close">×</button>
      </div>
    </div>
    <main>
      <p>Window content here.</p>
    </main>
  </body>
</html>
```

## View CSS — the magic property

```css
html, body { margin: 0; height: 100%; font-family: system-ui;
             background: #1e1e2e; color: #cdd6f4;
             border-radius: 12px; overflow: hidden; }

.titlebar {
  height: 36px;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px;
  background: rgba(0, 0, 0, 0.2);
  -electrobun-app-region: drag;       /* drags window */
}

.titlebar-drag { -electrobun-app-region: drag; }

.titlebar-buttons {
  -electrobun-app-region: no-drag;    /* buttons are clickable */
  display: flex; gap: 8px;
}

.titlebar-buttons button {
  background: transparent; border: 0; color: inherit; cursor: pointer;
  width: 24px; height: 24px; border-radius: 4px;
}

.titlebar-buttons button:hover { background: rgba(255, 255, 255, 0.1); }

main { padding: 16px; }
```

The `-electrobun-app-region` CSS property is the electrobun analog of Electron's `-webkit-app-region`. Source: `.cache/electrobun/package/src/bun/preload/dragRegions.ts`.

- `drag` → element acts as window-drag handle (mouse-drag moves the window).
- `no-drag` → element responds to mouse normally (clicks work).

Without explicit `no-drag` on buttons inside a `drag` region, clicks will be eaten by the drag region.

## View TS — wire the buttons

```ts
// src/mainview/index.ts
import { Electroview } from "electrobun/view";

new Electroview({ rpc: undefined });

document.getElementById("min")!.addEventListener("click", () => {
  // Pseudo — verify exact API name
  (window as any).__electrobunInternalBridge?.minimizeWindow?.();
});

document.getElementById("max")!.addEventListener("click", () => {
  (window as any).__electrobunInternalBridge?.toggleMaximize?.();
});

document.getElementById("close")!.addEventListener("click", () => {
  window.close();
});
```

Or use RPC to call back to bun and let bun call `win.close()` / `win.setBounds()` directly — cleaner if you have a typed RPC already.

## Multi-platform polish

```css
/* Hide title bar buttons on macOS — system traffic lights show instead */
@media (max-resolution: 0) { /* not a real query, just illustrating */ }
```

For real platform detection, expose `process.platform` to the view via RPC at startup:

```ts
// bun
requests: { platform: () => process.platform },

// view
const plat = await electroview.rpc.request.platform();
if (plat === "darwin") document.body.classList.add("macos");
```

Then CSS:

```css
body.macos .titlebar-buttons { display: none; }
body.macos .titlebar { padding-left: 80px; }   /* leave room for traffic lights */
```

## Source paths

- `.cache/electrobun/kitchen/src/playgrounds/custom-titlebar/`
- `.cache/electrobun/package/src/bun/preload/dragRegions.ts`
- `.cache/electrobun/docs/src/content/docs/electrobun/apis/browser/draggable-regions.mdx`
