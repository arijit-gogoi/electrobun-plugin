---
name: electrobun-zig-main
description: Use Zig as the main process instead of Bun. Covers `mainProcess: "zig"` build option, `src/zig-sdk/electrobun.zig` API surface (~120 FFI symbols for windows / webviews / wgpu / tray / menus / dialogs / clipboard / notifications / sessions / global shortcuts), the launcher's zig dispatch path, and when zig-main is worth the trade-offs. Use when the user asks about `mainProcess: "zig"`, calls into electrobun from Zig, wants smaller bundle / lower latency, or is doing native ML / GPU / systems work where Bun's overhead matters.
---

# Zig-main — run the main process in Zig instead of Bun

**Electron analog: none.** Electron's main process is always Node.js. Electrobun lets you swap Bun for Zig as the main process — same window / webview / tray / menu / GPU APIs, but called from Zig code instead of TypeScript.

## Why pick zig-main

- **Lower startup latency.** No JS runtime warm-up.
- **Smaller bundle.** Skip the Bun binary (~50 MB → ~5 MB main-process binary).
- **Tighter memory.** No V8 / JSC heap for main-process logic.
- **Native ML / GPU / systems work.** When main-process logic is mostly orchestration + FFI, Zig is the natural fit.
- **Single-language stack** for projects that prefer Zig (game engines, systems tools).

## Why **not** pick zig-main

- **Webview side is still TypeScript.** Renderer is HTML+JS regardless. You don't escape JS — you just move the bun/zig boundary.
- **Smaller ecosystem.** No npm in Zig. Most "but I needed a JSON parser / HTTP client / database driver" becomes a Zig dependency hunt.
- **API surface in Zig lags Bun's.** Bun side is the upstream's main investment; Zig SDK trails by a few features.
- **Most Electrobun docs / examples are Bun-first.** You'll be translating snippets.

Rule of thumb: pick zig-main only if main-process logic is genuinely small + native-heavy, or you have a hard latency / size budget Bun can't meet.

## Enable in `electrobun.config.ts`

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: { name: "Zig App", identifier: "com.example.zigapp", version: "0.1.0" },
  build: {
    mainProcess: "zig",
    zig: {
      entrypoint: "src/zig/main.zig",
    },
    views: {
      mainview: { entrypoint: "src/mainview/index.ts" },
    },
    copy: { "src/mainview/index.html": "views/mainview/index.html" },
    mac: {}, linux: {}, win: {},
  },
} satisfies ElectrobunConfig;
```

When `mainProcess: "zig"`, the build pipeline compiles `src/zig/main.zig` via the bundled zig toolchain, links against `libElectrobunCore`, and the launcher executes the zig main instead of forking Bun.

Source: `.cache/electrobun/package/build.ts` (zig branch), `.cache/electrobun/package/src/cli/index.ts` (`buildZigMainExecutable`).

## The zig SDK

The user-facing entry point is `.cache/electrobun/package/src/zig-sdk/electrobun.zig`. It dynamically loads `libElectrobunCore` (`.dll` / `.dylib` / `.so`) and `libwebgpu_dawn`, then exposes a `Core` struct with ~120 FFI symbols.

```zig
// src/zig/main.zig
const std = @import("std");
const electrobun = @import("electrobun");   // resolves to .cache/electrobun/package/src/zig-sdk/electrobun.zig

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const alloc = gpa.allocator();

    // Initialize the electrobun core
    try electrobun.Core.init(alloc);
    defer electrobun.Core.deinit();

    // Create a window
    const win = try electrobun.Core.createWindow(.{
        .title       = "Hello from Zig",
        .width       = 1024,
        .height      = 768,
        .url         = "views://mainview/index.html",
    });
    _ = win;

    // Hand off to the main event loop
    electrobun.Core.runMainLoop();
}
```

(API names approximate — verify exact signatures in `.cache/electrobun/package/src/zig-sdk/electrobun.zig`.)

## `Core` struct — the surface

Groupings of FFI symbols (~120 total):

- **Windows:** `createWindow`, `closeWindow`, `activateWindow`, `setBounds`, `setTitle`, `hide`, `show`, `setAlwaysOnTop`, `setVisibleOnAllWorkspaces`, etc.
- **Webviews:** `createWebview`, `loadURL`, `loadHTML`, `executeJavascript`, `setNavigationRules`, `findInPage`, `openDevTools`, `setPageZoom`, etc.
- **WebGPU:** `createGpuWindow`, `createWgpuView`, `getViewContextKey`, GPU device/queue/pipeline create symbols
- **Tray:** `createTray`, `setTrayMenu`, `setTrayIcon`, `setTrayTooltip`
- **Menus:** `setApplicationMenu`, `popupContextMenu`, `parseAccelerator`
- **Dialogs:** `showOpenDialog`, `showSaveDialog`, `showMessageBox`
- **Clipboard:** `clipboardReadText`, `clipboardWriteText`, `clipboardReadImage`, `clipboardWriteImage`, `clipboardAvailableFormatsCsv`, `clipboardClear`
- **Notifications:** `createNotification`, etc.
- **Sessions:** `sessionGetCookies`, `sessionSetCookie`, `sessionRemoveCookie`, `sessionClearCookies`, `sessionClearStorageData`
- **Global shortcuts:** `registerGlobalShortcut`, `unregisterGlobalShortcut`
- **Errors:** `lookupNativeSymbol`, `clearLastError`, `electrobun_core_last_error`

Source: `.cache/electrobun/package/src/zig-sdk/electrobun.zig`. For exact signatures, grep this file.

## RPC from zig

The renderer-side `Electroview.defineRPC` works the same way (TypeScript). On the zig side, you implement handlers in Zig that respond to webview requests:

```zig
// pseudo — verify in zig-sdk
try electrobun.Core.registerRpcHandler("readFile", struct {
    fn handle(args: anytype) !electrobun.RpcResponse {
        const path = args.path;
        const contents = try std.fs.cwd().readFileAlloc(alloc, path, 1024 * 1024);
        return electrobun.RpcResponse.string(contents);
    }
}.handle);
```

Real example: `.cache/electrobun/kitchen/src/zig/main.zig` is a 4384-line reference implementation that mirrors the bun-side kitchen-sink tests. Use it as the canonical "how to do X from Zig" lookup.

## Kitchen-sink zig main

`.cache/electrobun/kitchen/src/zig/main.zig` shows the full pattern:

- `AppState` struct holds global state.
- `ZigTest` / `TestKind` enum dispatched by `runZigTest`.
- `playgroundInternalBridge` handles RPC from playgrounds.
- `pub fn main()` at L4331 loads `electrobun.Core`, registers global handlers, spawns a `createUi` thread.
- The `mirrors_bun_test_name` field on `ZigTest` shows Zig tests intentionally mirror Bun tests by name → makes regressions visible across the two backends.

Test runner: `.cache/electrobun/kitchen/scripts/check-zig-test-mirrors.ts` verifies the parallel naming.

## Multi-threading

Zig has real threads (`std.Thread`). For UI ops, marshal back to the main thread via `dispatch_sync_main_void` (a high-degree symbol — every UI call funnels through it).

```zig
// From a worker thread, schedule a main-thread op
electrobun.Core.dispatch_sync_main_void(struct {
    fn run() void {
        electrobun.Core.createWindow(.{ ... });
    }
}.run);
```

This is the zig analog of `runOnMainThread` / `performSelectorOnMainThread` patterns. Source: search `.cache/electrobun/package/src/zig-sdk/electrobun.zig` for `dispatch_sync_main_void`.

## Build output

```
dist/
└── stable/
    └── darwin-arm64/
        ├── launcher           # tiny Zig launcher
        ├── main               # YOUR zig main, statically linked against libElectrobunCore
        ├── libElectrobunCore.dylib
        ├── libNativeWrapper.dylib
        ├── views/             # HTML/JS bundles
        └── build.json
```

No Bun runtime in the bundle. No `app.asar`. Just zig binaries + libs + views.

## When to mix bun + zig?

You can't have both as the main process at once. But you can:

- **Spawn Bun processes** from zig main via `std.process.Child` for npm-dependent tasks (e.g. one-off CLI utilities).
- **Use Bun as a build-time tool** (your `electrobun.config.ts` is still TS, processed by Bun at build time even for `mainProcess: "zig"` apps).

## Common gotchas

1. **Zig version compatibility.** Electrobun pins a specific Zig version (currently bundled via `package/vendors/zig/`). Your `main.zig` must compile with that version — check `package.json scripts check-zig-version`.
2. **API drift from bun.** Bun side gets new features first. If you ask "does electrobun support X in zig?", grep `.cache/electrobun/package/src/zig-sdk/electrobun.zig` first — feature may not exist there yet.
3. **Memory management.** No GC. Use an allocator, defer cleanup, free FFI-allocated strings via the matching `freeCoreString` / `electrobun_core_free_*` symbols.
4. **`Core.runMainLoop()` blocks.** Everything UI-related happens via dispatched callbacks. Don't try to "tick" the loop manually unless you understand the underlying event-loop integration.
5. **WGPU requires `bundleWGPU: true`.** Same as bun side. Without it, `libwebgpu_dawn` won't be shipped.
6. **Cross-compilation.** Zig is great at cross-compiling, but the bundled native wrappers + CEF / WebView2 / WebKit2GTK still need per-platform builds. You don't escape the platform matrix; you just speed up your zig parts.

## Live recipes

```text
mcp__deepwiki__ask_question repoName="blackboardsh/electrobun" question="Full list of symbols in libElectrobunCore vs libNativeWrapper for zig-main apps"
mcp__deepwiki__ask_question repoName="blackboardsh/electrobun" question="Minimum viable mainProcess:zig app — what files, what build, what runtime?"
mcp__context7__query-docs   libraryId="/blackboardsh/electrobun" query="zig-sdk electrobun.zig Core API examples"
```

## Cited from

- `.cache/electrobun/package/src/zig-sdk/electrobun.zig` — the zig SDK (the API surface)
- `.cache/electrobun/package/src/core/main.zig` — zig core (FFI host)
- `.cache/electrobun/package/src/launcher/main.zig` — launcher boot
- `.cache/electrobun/kitchen/src/zig/main.zig` — 4384-line reference impl
- `.cache/electrobun/kitchen/scripts/check-zig-test-mirrors.ts` — bun↔zig test name parity check
- `.cache/electrobun/kitchen/electrobun.config.ts:3-4` — `mainProcess: "bun" | "zig"` toggle
- `.cache/electrobun/package/build.ts` — zig branch of build pipeline
- `.cache/electrobun/package/src/cli/index.ts` — `buildZigMainExecutable`
- `.cache/electrobun/docs/src/content/docs/electrobun/apis/build-config.mdx` — `mainProcess` option
