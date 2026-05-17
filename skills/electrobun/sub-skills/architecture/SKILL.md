---
name: electrobun-architecture
description: How Electrobun is put together — 3-layer model (Bun TS / Zig core / native ObjC+C++), the FFI bridge, ZSTD self-extractor with `ELECTROBUN_ARCHIVE_V1` marker, the Zig launcher boot sequence, the CEF helper subprocess, preload script injection, ASAR loading, and Linux runtime `LD_PRELOAD` re-exec for CEF. Use when the user asks "how does X work internally", wants to understand the process model, the FFI symbol layout, or is debugging across the bun ↔ zig ↔ native boundary.
---

# Architecture — bun + zig + native, end to end

**Electron analog (loose):** Electron = Chromium + Node main process + Squirrel updater. Electrobun = system webview (or CEF) + Bun main process + Zig launcher/extractor + native bridge in ObjC/C++ + zig-optimized BSDIFF updater. Same shape, different parts.

## The 3 layers

```
┌────────────────────────────────────────────────────────────────┐
│  Bun TypeScript main process                                   │  ← your code lives here
│  package/src/bun/                                              │
│    core/{BrowserWindow,BrowserView,Tray,Updater,...}           │
│    preload/{events,internalRpc,index,index-sandboxed}          │
│    proc/native.ts             ← FFI proxy to Zig core          │
└──────────────────────────────┬─────────────────────────────────┘
                               │ FFI (Bun.dlopen)
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  Zig core                                                      │
│  package/src/core/main.zig                                     │
│    - hosts main thread                                         │
│    - dlopens libNativeWrapper                                  │
│    - exposes ~50 FFI symbols to bun                            │
│  package/src/zig-sdk/electrobun.zig                            │
│    - alternative entry for mainProcess: "zig" apps             │
└──────────────────────────────┬─────────────────────────────────┘
                               │ DynLib (zig std.DynLib)
                               ▼
┌────────────────────────────────────────────────────────────────┐
│  Native wrappers (per-platform)                                │
│  package/src/native/macos/nativeWrapper.mm           ObjC++    │
│  package/src/native/linux/nativeWrapper.cpp          C++       │
│  package/src/native/win/nativeWrapper.cpp            C++       │
│  package/src/native/shared/*.h                       headers   │
└────────────────────────────────────────────────────────────────┘
```

**Cross-cutting glue** (TS): `package/src/shared/{rpc.ts, naming.ts, platform.ts, electrobun-version.ts, bun-version.ts, cef-version.ts}`.

## Why three layers

| Layer | Why this language |
|---|---|
| **Bun TS** | Fast startup, TS-native, single binary, async-first, npm ecosystem available |
| **Zig** | C ABI, no GC, perfect for self-extractor + launcher + tight FFI bridge |
| **ObjC/C++** | Only language that talks to AppKit / WebKit2 / WebView2 / GTK / Win32 |

Source: `.cache/electrobun/README.md:14-17`.

## Process model at runtime

For an app with `mainProcess: "bun"` and one window:

```
1 launcher process (Zig binary that runs on double-click)
└─ 1 main process (Bun runtime)
   ├─ 1 webview process (per BrowserView)
   ├─ 1 webview process (per <electrobun-webview> OOPIF)
   └─ N CEF helper processes (if bundleCEF — renderer / gpu / utility)
```

The launcher is the entry point — it's what the OS executes. The launcher dlopens `libElectrobunCore` (Zig), calls `electrobun_core_run_main_thread`, hands off the main thread to Zig. Zig then dlopens `libNativeWrapper` and forks the Bun runtime to load `app.asar/bun/index.js`. Source: `.cache/electrobun/package/src/launcher/main.{ts,zig}`, `.cache/electrobun/package/src/core/main.zig`.

For `mainProcess: "zig"` apps, the launcher still bootstraps, but instead of forking Bun it runs the zig main directly using `zig-sdk/electrobun.zig`. See [`zig-main`](../zig-main/SKILL.md).

## Boot sequence (detailed)

1. **User double-clicks** the app icon → OS executes the launcher binary.
2. **Launcher** (Zig, `package/src/launcher/main.zig`):
   - Reads `Contents/Resources/build.json` (build metadata).
   - If first launch: invokes the self-extractor (see below).
   - Optionally re-execs itself with `LD_PRELOAD` on Linux if CEF libs are present (CEF needs that).
   - dlopens `libElectrobunCore` (the Zig core).
   - Calls `electrobun_core_run_main_thread`.
3. **Zig core** (`package/src/core/main.zig`):
   - dlopens `libNativeWrapper` (per-platform .dylib/.so/.dll).
   - Sets up the FFI symbol table the Bun side will use.
   - Forks the Bun runtime (or runs zig main for zig-as-main mode).
4. **Bun runtime** loads `app.asar/bun/index.js` (or `bun/index.js` if no asar):
   - User's main-process code runs.
   - `BrowserWindow`/`BrowserView` constructors call into FFI → Zig → Native → OS-native window/webview.

## Self-extractor — first-launch unpacking

For shipping, electrobun produces a single binary with a ZSTD-compressed payload appended after a sentinel:

```
[launcher binary][ELECTROBUN_ARCHIVE_V1 marker][zstd-compressed tar payload]
```

On Windows, an `AppMetadata` JSON sidecar lives in `.installer/`. On first launch:

1. Extractor (`package/src/extractor/main.zig`) reads the marker location.
2. Decompresses the tar payload into the per-user app data dir (`~/Library/Application Support/<id>` on mac, equivalent on win/linux).
3. Records that extraction is done.
4. Re-execs the actual launcher from the extracted dir.

Subsequent launches skip step 1-3 (extraction sentinel exists). This is why first-launch is slower than subsequent launches.

## FFI bridge — what bun calls

`package/src/bun/proc/native.ts` dlopens both:
- `libElectrobunCore` — ~50 FFI symbols for window / webview / wgpu / tray / menu
- `libNativeWrapper` — pointer-based variants of the same, for low-level operations

Bun side calls look like:

```ts
// pseudo, simplified
const winPtr = ffi.request.createWindow({ width, height, ... });
ffi.request.loadURL(viewPtr, "https://example.com");
```

`lookupNativeSymbol()` and `clearLastError()` are the two highest-degree symbols in the graph — every FFI call routes through symbol lookup + error-clear pattern.

## Native bridge — what zig + native do

Native wrappers register custom URL schemes (the `views://` scheme is implemented here in CEF helper processes), inject the four preload bridges into V8 contexts, hook navigation rules into `OnBeforeBrowse` (CEF) / `decidePolicyForNavigationAction` (WebKit), forward webview events back via FFI callbacks.

Shared C headers in `package/src/native/shared/*.h` are header-only utilities reused across platforms:

| Header | Purpose |
|---|---|
| `accelerator_parser.h` | Parse `CmdOrCtrl+Shift+P`-style strings into platform keycodes |
| `app_paths.h` | Resolve per-user app data path (`Electrobun.PATHS.RESOURCES_FOLDER`) |
| `asar.h` | FFI to `libasar` for reading bundled `app.asar` |
| `cef_response_filter.h` | Inject preload scripts into HTML after `<head>` (CEF) |
| `cache_migration.h` | One-shot CEF cache wipe on `CEF_CACHE_FORMAT_VERSION` bump |
| `callbacks.h` | Shared callback typedefs |
| `chromium_flags.h` | Apply `chromiumFlags` from build.json via `CefCommandLine` |
| `download_event.h` | Forward download events (started/progress/completed/failed) |
| `ffi_helpers.h` | C-string + JSON marshalling helpers |
| `glob_match.h` | Glob matching for navigation rules |
| `json_menu_parser.h` | Parse menu JSON into native menu items |
| `mime_types.h` | MIME type detection |
| `navigation_rules.h` | URL allow/block, `^` prefix = deny, last-match-wins |
| `partition_context.h` | `CefRequestContext` per `persist:` / `temp:` / default |
| `pending_resize_queue.h` | Defer resize ops until window is ready |
| `permissions.h` | Thread-safe 24h cache for user-media/geolocation grants |
| `permissions_cef.h` | Decode CEF permission bitmasks (24+ types) |
| `preload_script.h` | `PreloadScript` struct shared across response-filter and helper |
| `shutdown_guard.h` | Cleanup ordering at app quit |
| `thread_safe_map.h` | Generic thread-safe map for native side |
| `webview_storage.h` | Storage clearing primitives |

## CEF helper subprocess (when `bundleCEF: true`)

`cef_process_helper_{mac,linux,win}.cpp` are entry points for CEF subprocesses (renderer, gpu, utility). They:

1. Register the `views://` custom scheme with `CORS | SECURE | CSP_BYPASSING`.
2. Inject `__electrobunEventBridge`, `__electrobunHostBridge`, `__electrobunBunBridge`, `__electrobunInternalBridge` into V8 contexts on `OnContextCreated`.
3. Sandboxed contexts only get the EventBridge (the rest is wired in trusted contexts only).

Source: `.cache/electrobun/package/src/native/{macos,linux,win}/cef_process_helper_*.{cc,cpp}`.

## Preload script injection

For **CEF**: injected via `cef_response_filter.h` — filter HTML responses, inject `<script>` after `<head>`. Source: `package/src/native/shared/cef_response_filter.h` + `preload_script.h`.

For **system webview**:
- macOS: `WKWebViewConfiguration.userContentController.addUserScript`
- Windows: `ICoreWebView2_19.AddWebResourceRequestedFilterWithRequestSourceKinds` + `WebResourceRequested`
- Linux (WebKit2GTK): `webkit_user_content_manager_add_script`

All of them inject the bun-side preload bundle from `package/src/bun/preload/` (built into a single JS file per build via `package/src/bun/preload/build.ts`).

## Linux runtime quirks

- **`LD_PRELOAD` re-exec**: CEF on Linux requires its libs preloaded into the process. If CEF libs are present but `LD_PRELOAD` is unset, the launcher re-execs itself with `LD_PRELOAD` set. Source: `package/src/launcher/main.ts`.
- **ASAR loading via `libasar`**: launcher dlopens `libasar` to read `bun/index.js` from `app.asar`, writes it to a randomized tmpdir, loads via `new Worker()`. Source: same file.
- **GTK + AppIndicator** for tray. Some DEs (recent GNOME without extensions) silently no-op the tray icon — see `package/src/bun/proc/linux.md`.

## Cross-cutting modules

| Module | Role |
|---|---|
| `package/src/shared/rpc.ts` | `createRPC` generic + `defineElectrobunRPC` (bun/webview) — every IPC goes through this |
| `package/src/shared/naming.ts` | Single source of truth for artifact filenames + URLs (CLI + Updater both use it) |
| `package/src/shared/platform.ts` | Cached `OS` + `ARCH` constants; Windows-specific `x64` override |
| `package/src/shared/{electrobun,bun,cef}-version.ts` | Pinned versions (1.18.4-beta.3 / 1.3.13 / 147.0.10) |
| `package/src/bun/events/{event,eventEmitter}.ts` | `ElectrobunEvent<DataType,ResponseType>` base + `ElectrobunEventEmitter` singleton |

## Cross-cutting patterns to remember

1. **All IPC → typed RPC via `shared/rpc.ts`.** No string-based ipc-channel APIs.
2. **All artifact naming → `shared/naming.ts` helpers.** Don't handwrite filenames; regression test exists.
3. **All FFI → `bun/proc/native.ts` proxy.** Never dlopen native libs directly from app code; route through the proxy.
4. **All preload bridges = `__electrobun*` globals.** Sandboxed contexts get only EventBridge.
5. **All quit goes through `Utils.quit()`.** `process.exit` is overridden internally.
6. **All native shared utilities live in `package/src/native/shared/*.h`.** Header-only, used across mac/linux/win.

## Live recipes

```text
mcp__deepwiki__ask_question repoName="blackboardsh/electrobun" question="Trace the exact sequence from launcher exec to bun main running for mainProcess:bun"
mcp__deepwiki__ask_question repoName="blackboardsh/electrobun" question="Which native functions are exposed by libElectrobunCore vs libNativeWrapper?"
mcp__context7__query-docs   libraryId="/blackboardsh/electrobun" query="self-extractor ELECTROBUN_ARCHIVE_V1 marker structure"
```

## Cited from

- `.cache/electrobun/README.md`
- `.cache/electrobun/package/src/launcher/main.{ts,zig}` — boot sequence
- `.cache/electrobun/package/src/core/main.zig` — zig core entry
- `.cache/electrobun/package/src/extractor/main.zig` — ZSTD self-extractor
- `.cache/electrobun/package/src/zig-sdk/electrobun.zig` — zig-as-main API
- `.cache/electrobun/package/src/bun/proc/native.ts` — FFI proxy
- `.cache/electrobun/package/src/native/{macos,linux,win}/{nativeWrapper,cef_process_helper}.*`
- `.cache/electrobun/package/src/native/shared/*.h` — shared C headers
- `.cache/electrobun/package/src/shared/{rpc,naming,platform}.ts`
- `.cache/electrobun/package/src/bun/preload/{index,index-sandboxed,build}.ts`
- `.cache/electrobun/package/src/bun/events/{event,eventEmitter}.ts`
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/architecture/overview.mdx`
- `.cache/electrobun/package/src/bun/proc/linux.md` — Linux runtime notes
- `specs/recon-electrobun-9e421ff.md` — distilled architecture from graphify
