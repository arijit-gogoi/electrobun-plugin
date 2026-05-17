---
name: electrobun-system-integration
description: Native OS surfaces — `Tray`, `ApplicationMenu`, `ContextMenu`, global shortcuts, clipboard, file dialogs, permissions, app icons, deep linking (`urlSchemes`), `open-url` events, sessions / cookies / storage, displays / cursor / screen info. Use when the user wants to add tray icons, menu bars, context menus, keyboard shortcuts, file open/save dialogs, permission prompts, clipboard I/O, app icon work, or deep-link handling.
---

# System integration — Tray, menus, shortcuts, clipboard, dialogs, sessions

**Electron analogs:**
- `Tray` → `Tray` (same name, similar API)
- `Menu.buildFromTemplate` → `ApplicationMenu` + `ContextMenu`
- `globalShortcut.register` → `Electrobun.shortcuts.register` (verify exact namespace)
- `clipboard` → `Electrobun.clipboard.*`
- `dialog.showOpenDialog` → `Electrobun.dialog.*`
- `app.setAsDefaultProtocolClient` → `app.urlSchemes` in config + `open-url` event
- `session.defaultSession.cookies` → `Electrobun.session.*` (cookies + storage + clear)

## Tray (menu-bar / system tray icon)

```ts
import { Tray } from "electrobun/bun";

const tray = new Tray({
  icon: "assets/tray-icon-template.png",     // template image on mac (auto-tinted)
  tooltip: "My App",
});

tray.setMenu([
  { label: "Open Dashboard", click: () => mainWin.show() },
  { type: "separator" },
  { label: "Preferences…", accelerator: "CmdOrCtrl+,", click: openPrefs },
  { type: "separator" },
  { label: "Quit", role: "quit" },
]);

tray.on("click",        () => mainWin.show());      // left click
tray.on("right-click",  () => /* show context */);
```

**Platform notes:**
- **macOS:** template images (`-template` suffix) auto-invert with dark/light mode. PNG with alpha.
- **Linux:** requires GTK + `libayatana-appindicator3` (Ubuntu) or equivalent. Tray docs: `.cache/electrobun/package/src/bun/proc/linux.md` for the desktop-environment requirements.
- **Windows:** uses system tray API.

Source: `.cache/electrobun/package/src/bun/core/Tray.ts`. Template: `.cache/electrobun/templates/tray-app/`. Playground: `.cache/electrobun/kitchen/src/playgrounds/tray/`. Test: `.cache/electrobun/kitchen/src/tests/tray-api.test.ts`.

## ApplicationMenu (macOS menu bar / app-level menus)

```ts
import { ApplicationMenu } from "electrobun/bun";

ApplicationMenu.setMenu([
  {
    label: "File",
    submenu: [
      { label: "New Window", accelerator: "CmdOrCtrl+N", click: () => new BrowserWindow({...}) },
      { type: "separator" },
      { label: "Close",      role: "close" },
    ],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" },  { role: "copy" }, { role: "paste" },
    ],
  },
  {
    label: "View",
    submenu: [
      { label: "Toggle DevTools", accelerator: "CmdOrCtrl+Alt+I",
        click: () => focusedWebview?.toggleDevTools() },
    ],
  },
]);
```

**macOS:** populates the system menu bar. **Windows / Linux:** typically used for in-window menus.

Roles available (from `.cache/electrobun/package/src/bun/core/menuRoles.ts`): `quit`, `close`, `minimize`, `zoom`, `front`, `cut`, `copy`, `paste`, `selectAll`, `undo`, `redo`, `pasteAndMatchStyle`, `delete`, `reload`, `forceReload`, `toggleDevTools`, `resetZoom`, `zoomIn`, `zoomOut`, `togglefullscreen`, `services`, `hide`, `hideOthers`, `unhide`, `about`, etc.

**Accelerators** parsed by `.cache/electrobun/package/src/native/shared/accelerator_parser.h` — Electron-style: `CmdOrCtrl+Shift+P`, `Alt+F4`, `F11`.

Source: `.cache/electrobun/package/src/bun/core/ApplicationMenu.ts`. Playground: `.cache/electrobun/kitchen/src/playgrounds/application-menu/`.

## ContextMenu (right-click menus)

```ts
import { ContextMenu } from "electrobun/bun";

webview.on("context-menu", async (e) => {
  const menu = new ContextMenu([
    { label: "Inspect Element", click: () => webview.openDevTools() },
    { type: "separator" },
    { label: "Copy",  role: "copy"  },
    { label: "Paste", role: "paste" },
  ]);
  await menu.popup({ x: e.detail.x, y: e.detail.y });
});
```

Source: `.cache/electrobun/package/src/bun/core/ContextMenu.ts` (near-identical surface to `ApplicationMenu`). Playground: `.cache/electrobun/kitchen/src/playgrounds/context-menu/`.

## Global shortcuts

```ts
// Pseudo — verify exact namespace in .cache/electrobun
import { Electrobun } from "electrobun/bun";

Electrobun.shortcuts.register("CmdOrCtrl+Shift+Space", () => {
  mainWin.show();
  mainWin.focus();
});
```

Registered system-wide; fires even when the app is unfocused. Linux requires the WM to support the chosen accelerator. Source: search `.cache/electrobun/package/src/bun/core/` and `.cache/electrobun/package/src/native/win/nativeWrapper.cpp` for `registerGlobalShortcut`. Playground: `.cache/electrobun/kitchen/src/playgrounds/shortcuts/`. Test: `.cache/electrobun/kitchen/src/tests/interactive/shortcuts.test.ts`.

## Clipboard

```ts
import { Electrobun } from "electrobun/bun";

// Text
Electrobun.clipboard.writeText("hello");
const t = Electrobun.clipboard.readText();

// Image
Electrobun.clipboard.writeImage(buffer);    // PNG buffer
const img = Electrobun.clipboard.readImage();

// Available formats
const formats = Electrobun.clipboard.availableFormats();   // e.g. ["text/plain", "image/png"]

Electrobun.clipboard.clear();
```

Source: search `.cache/electrobun/package/src/native/*/nativeWrapper.*` for `clipboard*` exports + `.cache/electrobun/package/src/zig-sdk/electrobun.zig` for the zig-SDK equivalents. Playground: `.cache/electrobun/kitchen/src/playgrounds/clipboard/`.

## File dialogs

```ts
// Open
const paths = await Electrobun.dialog.showOpenDialog({
  title: "Pick a file",
  defaultPath: "/Users/me/Documents",
  filters: [
    { name: "Images", extensions: ["png", "jpg", "webp"] },
    { name: "All",    extensions: ["*"]                  },
  ],
  properties: ["openFile", "multiSelections"],
});
// paths: string[] or null if cancelled

// Save
const path = await Electrobun.dialog.showSaveDialog({
  title: "Save as",
  defaultPath: "untitled.txt",
  filters: [{ name: "Text", extensions: ["txt"] }],
});
```

Playground: `.cache/electrobun/kitchen/src/playgrounds/file-dialog/`. Test: `.cache/electrobun/kitchen/src/tests/interactive/dialogs.test.ts`.

## Permissions (camera / mic / geolocation / notifications)

In `electrobun.config.ts`:

```ts
mac: {
  entitlements: {
    "com.apple.security.device.camera":        "Camera for video features",
    "com.apple.security.device.microphone":    "Mic for audio features",
    "com.apple.security.personal-information.location": "Location for nearby search",
  },
}
```

Runtime: Chromium / system webview prompts the user the first time JS asks. You can pre-grant or deny via:

```ts
webview.on("permission-request", (e) => {
  // e.detail: { permission, origin }
  e.allow();   // or e.deny();
});
```

Headers: `.cache/electrobun/package/src/native/shared/permissions.h` (24-hour cache for user-media/geolocation/notification grants) + `permissions_cef.h` (CEF permission bitmask decode). Playground: `.cache/electrobun/kitchen/src/tests/interactive/permissions.test.ts`.

## App icons

```ts
// electrobun.config.ts
mac:   { icons: "App.icon" },                                // .icon (v1.18.0+) or "icon.iconset"
linux: { icon: "icon.iconset/icon_256x256.png" },
win:   { icon: "icon.iconset/icon_256x256.png" },
```

For tray icons see Tray section above.

Source: `.cache/electrobun/docs/src/content/docs/electrobun/apis/application-icons.mdx`.

## Deep linking — `myapp://` custom URL scheme

```ts
// electrobun.config.ts
app: {
  // ...
  urlSchemes: ["myapp"],
},

// src/bun/index.ts
Electrobun.events.app.on("open-url", (e) => {
  console.log("opened with URL:", e.detail.url);   // e.g. "myapp://action/123"
});
```

Available **since v1.18.0**. On macOS, registers via `LSSetDefaultHandlerForURLScheme`. On Linux, writes `.desktop` MIME associations. On Windows, registry-based protocol handler.

`app.fileAssociations` (also v1.18.0+) registers file extensions your app opens — same `open-url` event fires when the user double-clicks a registered file. Source: `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-18-0.mdx`.

## App reopen (macOS dock click after close)

```ts
Electrobun.events.app.on("reopen", () => {
  if (mainWin?.isDestroyed?.()) {
    mainWin = new BrowserWindow({...});
  } else {
    mainWin.show();
  }
});
```

Wired via the Win/Mac native `setAppReopenHandler`.

## Sessions / cookies / storage

```ts
// Cookies — per-partition
await Electrobun.session.getCookies({ url: "https://example.com" });
await Electrobun.session.setCookie({ url: "...", name: "...", value: "...", domain: "...", path: "/" });
await Electrobun.session.removeCookie({ url: "...", name: "..." });
await Electrobun.session.clearCookies();

// Storage (localStorage / IndexedDB / cache)
await Electrobun.session.clearStorageData({ storages: ["localStorage", "cookies", "cache"] });
```

Partition isolation — pass a partition string per BrowserView:

```ts
new BrowserWindow({
  url: "...",
  partition: "persist:guest",     // separate cookie jar / localStorage
});
```

`persist:` prefix = on-disk; `temp:` (or no prefix) = in-memory only. Source: `.cache/electrobun/package/src/native/shared/partition_context.h`. Playground: `.cache/electrobun/kitchen/src/playgrounds/session/`. Test: `.cache/electrobun/kitchen/src/tests/session.test.ts`.

## Displays / cursor / screen info

```ts
const displays  = Electrobun.screen.getAllDisplays();
const primary   = Electrobun.screen.getPrimaryDisplay();
const cursorPos = Electrobun.screen.getCursorScreenPoint();   // { x, y }
```

Use for multi-monitor placement, mouse-tracking overlays, etc. Source: search `.cache/electrobun/package/src/native/*/nativeWrapper.*` for `getAllDisplays` / `getPrimaryDisplay` / `getCursorScreenPoint`.

## Linux DE-specific notes

Tray requires AppIndicator. Some menus may no-op on non-standard DEs. Specifics: `.cache/electrobun/package/src/bun/proc/linux.md`.

## Common gotchas

1. **macOS template images** need the `-template` suffix in the filename (e.g. `tray-template.png`) for auto-tinting in dark mode.
2. **Roles `quit` / `close` / etc.** are required for menus to show standard macOS menu items. Don't reimplement them with `click` handlers — use the role.
3. **Accelerator strings are case-sensitive in parser** — use `CmdOrCtrl` exactly, not `cmdOrCtrl`.
4. **Permission entitlements** must be set in `electrobun.config.ts` `entitlements`, not via runtime API — macOS sandboxing rejects runtime grants for hardware access.
5. **`open-url` fires both on first launch and on subsequent activation.** Check whether your bun setup has fully initialised before reacting (queue events during boot).
6. **Tray on Linux is fragile.** GNOME removed default tray support years ago; the user may need a third-party extension. Don't make tray-only the only entry point.

## Live recipes

```text
mcp__context7__query-docs   libraryId="/blackboardsh/electrobun" query="Tray complete example with submenu and accelerators"
mcp__deepwiki__ask_question repoName="blackboardsh/electrobun" question="Exact namespace for global shortcuts API?"
```

## Cited from

- `.cache/electrobun/package/src/bun/core/{Tray,ApplicationMenu,ContextMenu,menuRoles}.ts`
- `.cache/electrobun/package/src/native/shared/{accelerator_parser,permissions,permissions_cef,partition_context}.h`
- `.cache/electrobun/package/src/native/{macos,linux,win}/nativeWrapper.*`
- `.cache/electrobun/package/src/zig-sdk/electrobun.zig` — clipboard, displays
- `.cache/electrobun/package/src/bun/proc/linux.md` — Linux DE notes
- `.cache/electrobun/docs/src/content/docs/electrobun/apis/{application-icons,application-menu,context-menu,tray}.mdx`
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-18-0.mdx` — urlSchemes, fileAssociations
- `.cache/electrobun/kitchen/src/playgrounds/{tray,application-menu,context-menu,shortcuts,clipboard,file-dialog,session}/`
- `.cache/electrobun/kitchen/src/tests/{tray-api,session}.test.ts`
- `.cache/electrobun/kitchen/src/tests/interactive/{dialogs,permissions,shortcuts,tray}.test.ts`
