# Recon: electrobun @ 9e421ff (2026-05-17)

Upstream HEAD: `9e421ff2c9c987c6935aa1679348ec91e66b2af1` (main)
Version: `1.18.4-beta.3`
Sources synthesized: deepwiki structure + context7 cheatsheet (1104 snippets) + local clone (graphify on package + kitchen + docs)

---

## TL;DR

Electrobun = ultra-fast, tiny, cross-platform desktop framework. **TypeScript + Bun + Zig + native (ObjC/C++)**. Self-extracting ~14MB bundles via ZSTD, 4KB BSDIFF patches. System webview default, optional bundled CEF. Distinguishes itself from Electron via: native bindings layer in Zig, single-binary distribution, WebGPU first-class (`<electrobun-wgpu>`), OOPIF webview-tag (`<electrobun-webview>`).

## Architecture (3-layer)

1. **Bun TS layer** (`package/src/bun/`) — main process, user-facing API surface
2. **Zig core** (`package/src/{core,extractor,launcher,zig-sdk}/`) — launcher, self-extractor, FFI bridge, optional zig-as-main mode
3. **Native wrappers** (`package/src/native/{macos,linux,win,shared}/`) — per-platform webview + window + system integration (ObjC `.mm` on mac, C++ on Linux/Win)

Cross-cutting: `shared/rpc.ts` (RPC core), `shared/naming.ts` (artifact name discipline), `shared/platform.ts`.

## Public API surface (`exports`)

- `electrobun` — CLI (`init`, `build`, `dev`, `canary`)
- `electrobun/bun` — main process API (`BrowserWindow`, `BrowserView`, `Tray`, `ApplicationMenu`, `ContextMenu`, `Updater`, `Utils`, etc.)
- `electrobun/view` — renderer-side (`Electroview`, `Electroview.defineRPC`)

## Key concepts mapped

| Concept | Electron analog | Notes |
|---|---|---|
| `BrowserWindow` | BrowserWindow | Native window, composes BrowserView |
| `BrowserView` | BrowserView/WebContentsView | Webview instance, has `webview.rpc`, `webview.executeJavascript`, navigation rules in native |
| `Electroview` | (no direct analog — ipcRenderer) | Browser-side class, exposes typed RPC via `defineRPC` |
| IPC = typed RPC | ipcMain/ipcRenderer | `rpc.request.X({...})` / `rpc.send.X({...})` / `handlers.{requests,messages}` |
| `views://` scheme | `file://` | Custom URL scheme for app-bundled HTML |
| `BrowserView.setNavigationRules` | webRequest filtering | Glob-based allow/block, evaluated in **native** — no JS round-trip |
| `Tray` | Tray | macOS/Win/Linux (Linux requires GTK + AppIndicator) |
| `Updater` | autoUpdater | BSDIFF patches (4KB typical), full-bundle fallback, Windows uses `.bat` trick due to file locking |
| `Utils.quit()` | app.quit() | Cancellable `beforeQuit` event, `process.exit` overridden |
| `<electrobun-webview>` | `<webview>` | OOPIF, transparent layering, IPC via host-message |
| `<electrobun-wgpu>` | (none) | Native GPU surface composited into webview |
| `GpuWindow` + `WGPUView` | (none) | Bun TS → native WebGPU FFI (Dawn) without a webview |
| `bundleCEF: true` | (default) | Pin Chromium ~150MB. Default is system webview ~14MB. |
| `bundleWGPU: true` | (none) | Bundle Dawn (WebGPU native) |
| `mainProcess: "bun" \| "zig"` | (none) | Optional zig-as-main-process |
| Three.js / Babylon.js adapters | (none) | First-class via `webgpuAdapter.ts`, ~17 W3C-mirrored GPU* classes |
| Self-extracting bundle | (none — uses asar) | ZSTD compression, marker `ELECTROBUN_ARCHIVE_V1` |
| ASAR | asar | electrobun also uses asar internally (via `libasar` dlopen) |

## Build pipeline (`package/build.ts`)

`setup() → vendor*() → build() → buildNative/buildCore/buildLauncher/buildCli/buildMainJs/buildPreload/buildSelfExtractor → copyToDist()`

26 functions. CLI dev/release variants. Triggered via `bun dev` / `bun build:dev` / `bun build:release` from `/package`.

## Templates (19 in `templates/`)

**Framework starters:** angular, react-tailwind-vite, solid, svelte, vue, tailwind-vanilla, vanilla-vite
**Feature demos:** bunny, hello-world, multi-window, multitab-browser, notes-app, photo-booth, sqlite-crud, tray-app
**WebGPU:** wgpu, wgpu-babylon, wgpu-mlp, wgpu-threejs

→ `bunx electrobun init` shows template-picker.

## Kitchen-sink (`kitchen/`)

18 playgrounds × 4 platforms = the canonical "what can it do" demo:
application-menu, clipboard, context-menu, custom-titlebar, draggable, file-dialog, host-message, multiwindow-cef, quit-test, session, shortcuts, transparent-window, tray, webview-cleanup, webview-settings, webviewtag, wgpu-tag, window-events-{move-resize,blur-focus}.

Test framework: `test-framework/executor.ts` + `test-runner` + `test-harness` views; ~20 `.test.ts` automated + `interactive/*.test.ts` for human-validated UX.

## Documentation map (`docs/src/content/docs/electrobun/`)

- `guides/`: quick-start, hello-world, creating-ui, cross-platform-development, bundling-and-distribution, code-signing, updates, compatibility, architecture/{overview,webview-tag}, changelog/{v1.0-v1.18.1}
- `apis/`: application-icons, application-menu, browser-view, browser-window, build-config, bun, bundled-assets, bundling-cef, context-menu, events, paths, tray, updater, utils, webgpu
- `apis/browser/`: draggable-regions, electrobun-webview-tag, electrobun-wgpu-tag, electroview-class, global-properties
- `apis/cli/`: build-configuration, cli-args

## Graphify findings

**Stats:** 3710 nodes / 6041 edges / 350 communities (after chunk-08 doc API .mdx coverage added; previously 3589n / 5916e / 343c). ~150 are singletons/tiny — normal AST noise. Top 15 communities cover ~1000 meaningful nodes.

**God nodes (top 10 by degree):**
1. `Core` (zig-sdk) — 116
2. `lookupNativeSymbol()` — 111
3. `clearLastError()` — 81
4. `runZigTest()` — 73
5. `dispatch_sync_main_void()` — 62
6. `log()` — 58
7. `dispatch_sync()` — 49
8. `AppState` — 41
9. `ElectrobunWebviewTag` — 37
10. `sleepMs()` — 36

**Top community clusters (proposed sub-skill mapping):**

| # | Cluster | Size | Primary paths | Maps to sub-skill |
|---|---|---|---|---|
| 0 | Native Windows Wrapper | 100 | `native/win/nativeWrapper.cpp` | (deep dive on demand) |
| 1 | Zig SDK Surface | 91 | `src/zig-sdk/electrobun.zig` | zig-main |
| 2 | Native Linux Wrapper | 89 | `native/linux/nativeWrapper.cpp` | (deep dive on demand) |
| 3 | Zig Core FFI | 64 | `src/core/main.zig` | architecture |
| 4 | Bun Core Classes | 64 | `bun/core/*` | views, ipc-rpc, tray, updater |
| 5 | Bun-Native Proxy | 61 | `bun/proc/native.ts` | architecture |
| 6 | Interactive Tests | 60 | `tests/interactive/*` | (reference) |
| 7 | Zig Core Impl | 60 | `src/core/main.zig` | architecture |
| 8 | Build Pipeline | 56 | `package/build.ts` | scaffold, build-dist |
| 9 | Test Framework Engine | 53 | `test-framework/*` | testing |
| 10 | App Bootstrap & Carrots | 52 | `bun/index.ts`, `ElectrobunConfig.ts`, `Updater.ts` | scaffold, updater |
| 11 | WebGPU Adapter (Dawn) | 51 | `bun/webgpuAdapter.ts` | webgpu |
| 12 | Native Linux (cont.) | 50 | `native/linux/*` | (deep dive on demand) |
| 13 | Native Bridge Headers | 49 | `package/src/{core,native,extractor}` | architecture |
| 14 | Zig SDK Helpers | 47 | `src/zig-sdk/electrobun.zig` | zig-main |

**Cross-community bridges (high betweenness):**
- `Tray` — bridges Bun Core Classes ↔ App Bootstrap ↔ Native (44/87/10)
- `setApplicationMenu()` — bridges App Bootstrap ↔ Native (Win/Linux)
- `createWindowWithFrameAndStyleFromWorker()` — same bridge

## Notable surprises (cross-doc ↔ code)

- API .mdx files (BrowserView, BrowserWindow, bundling-cef) connect directly to their TS/zig implementations — strong doc-code coherence, low risk of stale docs.
- `<electrobun-wgpu>` semantically similar to `<electrobun-webview>` — both are custom-element overlays sharing OverlaySyncController for rect-sync RPCs.

## Unique-to-electrobun (no Electron analog)

- Self-extracting bundle with ZSTD + ELECTROBUN_ARCHIVE_V1 marker
- BSDIFF patches (zig-optimized) for 4KB app updates
- Zig main process option (`mainProcess: "zig"`)
- `<electrobun-wgpu>` + `GpuWindow` + `WGPUView` (WebGPU without a webview)
- Three.js / Babylon.js adapters that work directly from Bun
- Native navigation rules (evaluated in C++ before page load — no JS round-trip)
- macOS App Store Connect notarization built into Updater
- Carrots / Bunny Ears integration (carrot mode = no FFI; alternate execution context)

---

## Proposed sub-skill list (8 sub-skills)

Rationale: cluster the user's likely tasks, not the codebase's internal module boundaries. Each sub-skill is a complete unit of "I want to do X with electrobun."

| Sub-skill | Triggers when... | Primary refs |
|---|---|---|
| **scaffold** | "new electrobun app", "init project", "starter", "template" | templates/, kitchen/, electrobun.config.ts |
| **views** | "BrowserWindow", "BrowserView", "webview", "navigation", "devtools", "window events" | bun/core/Browser{Window,View}.ts, webview-tag |
| **ipc-rpc** | "IPC", "RPC", "send message bun to webview", "preload", "Electroview.defineRPC" | shared/rpc.ts, bun/preload/*, browser/index.ts, electroview-class.mdx |
| **build-dist** | "build for release", "bundleCEF", "code sign", "notarize", "distribute" | build.ts, ElectrobunConfig.ts, bundling docs |
| **updater** | "auto update", "bsdiff", "patch", "release channel", "canary/stable" | bun/core/Updater.ts, updater.mdx, naming.ts |
| **webgpu** | "webgpu", "wgpu", "GpuWindow", "three.js", "babylon", "native GPU" | bun/webgpuAdapter.ts, webGPU.ts, wgpu templates |
| **system-integration** | "Tray", "menu", "shortcuts", "clipboard", "file dialog", "permissions", "app icon" | bun/core/Tray.ts, ApplicationMenu.ts, ContextMenu.ts, native shared |
| **architecture** | "how does X work", "Zig + Bun + Native", "self-extractor", "FFI", "process model" | core/main.zig, launcher/, extractor/, native/shared/ |

**Optional 9th** (if user wants): **zig-main** — running the main process in Zig instead of Bun. Niche but distinctive.

Main `SKILL.md` decides which sub-skill applies + dispatches; also handles general Q&A when no sub-skill fits (live deepwiki/context7 fallback).

## Recon artifacts

- `graphify-out/graph.html` — interactive (3589 nodes)
- `graphify-out/graph.json` — JSON for `/graphify query`
- `graphify-out/GRAPH_REPORT.md` — full audit
- `.cache/electrobun/` — local clone (gitignored, not redistributed)
