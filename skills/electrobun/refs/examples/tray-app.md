---
source: .cache/electrobun/templates/tray-app/ + kitchen playgrounds/tray/
upstream_sha: 9e421ff2c9c987c6935aa1679348ec91e66b2af1
captured_at: 2026-05-17
---

# Tray-only app — menu-bar utility pattern

Tray icon + popover-style window. Common for menubar apps (Bartender, Itsycal, Magnet, etc.).

## electrobun.config.ts

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Tray Util",
    identifier: "com.example.tray-util",
    version: "0.1.0",
  },
  runtime: {
    exitOnLastWindowClosed: false,   // keep app alive without windows
  },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "src/bun/index.ts" },
    views: { mainview: { entrypoint: "src/mainview/index.ts" } },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "assets/tray-icon-template.png": "views/assets/tray-icon-template.png",
    },
    mac:   { icons: "App.icon" },
    linux: { icon: "icon.iconset/icon_256x256.png" },
    win:   { icon: "icon.iconset/icon_256x256.png" },
  },
} satisfies ElectrobunConfig;
```

## src/bun/index.ts

```ts
import { BrowserWindow, Tray, Utils } from "electrobun/bun";

let popover: BrowserWindow | null = null;

function showPopover(x: number, y: number) {
  if (popover && !popover.isDestroyed?.()) {
    popover.focus();
    return;
  }
  popover = new BrowserWindow({
    url: "views://mainview/index.html",
    width: 320,
    height: 480,
    x: x - 160,                 // centre under cursor
    y: y + 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
  });

  popover.on("blur", () => popover?.close());   // close when user clicks away
  popover.on("close", () => { popover = null; });
}

const tray = new Tray({
  icon: "assets/tray-icon-template.png",
  tooltip: "Tray Util",
});

tray.on("click", (e) => {
  // e.detail.x / e.detail.y = click location in screen coords
  showPopover(e.detail.x, e.detail.y);
});

tray.setMenu([
  { label: "Open",  click: (e) => showPopover(e.x ?? 0, e.y ?? 0) },
  { type: "separator" },
  { label: "Quit",  click: () => Utils.quit() },
]);
```

## src/mainview/index.html

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 16px; font-family: system-ui;
                   background: rgba(255, 255, 255, 0.95); border-radius: 12px;
                   color: #111; }
      h1 { font-size: 18px; margin: 0 0 8px; }
    </style>
    <script type="module" src="index.ts"></script>
  </head>
  <body>
    <h1>Tray Util</h1>
    <p>Click outside to dismiss.</p>
  </body>
</html>
```

## Platform notes

- **macOS:** template image (`-template` suffix) auto-tints with dark/light mode. PNG with alpha at 32x32 (regular) and 64x64 (retina).
- **Linux:** requires AppIndicator. Many GNOME setups need a third-party extension. Provide an alternate non-tray entry point.
- **Windows:** standard system tray, no special requirements.

See `.cache/electrobun/package/src/bun/proc/linux.md` for Linux DE specifics.

## Source paths

- `.cache/electrobun/templates/tray-app/`
- `.cache/electrobun/kitchen/src/playgrounds/tray/`
- `.cache/electrobun/kitchen/src/tests/tray-api.test.ts`
- `.cache/electrobun/kitchen/src/tests/interactive/tray.test.ts`
- `.cache/electrobun/package/src/bun/core/Tray.ts`
