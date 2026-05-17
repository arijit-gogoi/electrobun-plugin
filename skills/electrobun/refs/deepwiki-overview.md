---
source: deepwiki MCP — blackboardsh/electrobun
upstream_sha: 9e421ff2c9c987c6935aa1679348ec91e66b2af1
upstream_version: 1.18.4-beta.3
captured_at: 2026-05-17
refresh_via: bun run scripts/refresh-refs.ts
---

# Electrobun — DeepWiki Overview

Mirrors the wiki structure DeepWiki publishes for `blackboardsh/electrobun`.
Use as quick map. For deep questions, call `mcp__deepwiki__ask_question` live.

## Wiki structure

- **1 Overview**
  - 1.1 Quick Start
  - 1.2 Core Concepts
- **2 Architecture**
  - 2.1 Multi-Process Model
  - 2.2 Native Bridge Layer
  - 2.3 Webview Rendering System
  - 2.4 RPC Communication System
- **3 API Reference**
  - 3.1 BrowserWindow API
  - 3.2 BrowserView API
  - 3.3 Renderer APIs
  - 3.4 System Integration APIs
  - 3.5 Auto-Update System
  - 3.6 Session and Storage
- **4 Build and Deployment**
  - 4.1 Project Configuration
  - 4.2 Build System
  - 4.3 Native Dependencies (CEF)
  - 4.4 Distribution and Updates
  - 4.5 CI/CD and Release Workflow
- **5 Development Guide**
  - 5.1 Application Structure
  - 5.2 Testing Applications
  - 5.3 Example Applications
  - 5.4 Working with RPC
  - 5.5 WebGPU Rendering
- **6 Glossary**

## What Electrobun is

> Ultra-fast, tiny, cross-platform desktop framework. TypeScript main process via Bun; native bindings in ObjC, C++, and Zig. Self-extracting bundles (~14 MB with system webview, ~150 MB with bundled CEF). 4 KB BSDIFF patches.
>
> — `.cache/electrobun/README.md:14-17`

## The 3-layer architecture

| Layer | Language | Where (in upstream) | Role |
|---|---|---|---|
| Main process | TypeScript (Bun) | `package/src/bun/` | App logic, public API surface |
| Core / launcher / extractor | Zig | `package/src/{core,launcher,extractor,zig-sdk}/` | Self-extract bundle, FFI bridge, optional zig-as-main |
| Native wrappers | ObjC / C++ / C | `package/src/native/{macos,linux,win,shared}/` | Per-platform webview, window, system integration |

Cross-cutting glue (TypeScript): `package/src/shared/{rpc.ts, naming.ts, platform.ts}`.

## Public exports (from `package/package.json:14-18`)

```json
"exports": {
  ".":      "./dist/api/bun/index.ts",
  "./bun":  "./dist/api/bun/index.ts",
  "./view": "./dist/api/browser/index.ts"
}
```

- `electrobun` — main-process API (re-export of `electrobun/bun`)
- `electrobun/bun` — `BrowserWindow`, `BrowserView`, `Tray`, `ApplicationMenu`, `ContextMenu`, `Updater`, `Utils`, `Paths`, `app`, `Electrobun.*`
- `electrobun/view` — `Electroview`, `Electroview.defineRPC`

`bin`: `electrobun` (CLI) → `bin/electrobun.cjs`, dispatches to `package/src/cli/index.ts`.

## Runtime model

- 1 main process (Bun runtime, OR Zig if `mainProcess: "zig"`)
- N webview processes (per `BrowserView`) — system webview by default, CEF if `bundleCEF: true`
- 1 launcher (Zig) — entry point of the shipped binary; locates the runtime, hands off
- 1 self-extractor (Zig) — unpacks ZSTD archive into the per-user app dir on first launch

## Key concepts → upstream paths

| Concept | Path |
|---|---|
| `BrowserWindow` | `package/src/bun/core/BrowserWindow.ts` |
| `BrowserView` | `package/src/bun/core/BrowserView.ts` |
| `Electroview` (renderer) | `package/src/browser/index.ts` |
| Custom elements `<electrobun-webview>`, `<electrobun-wgpu>` | `package/src/browser/{webviewtag,wgputag}.ts` |
| RPC core | `package/src/shared/rpc.ts` |
| Preload bridges (event/internal/host/bun) | `package/src/bun/preload/{events,internalRpc,index,index-sandboxed}.ts` |
| Tray / menus | `package/src/bun/core/{Tray,ApplicationMenu,ContextMenu}.ts` |
| Updater (BSDIFF + ZSTD fallback) | `package/src/bun/core/Updater.ts` |
| WebGPU adapter | `package/src/bun/{webGPU,webgpuAdapter}.ts` |
| GpuWindow + WGPUView | `package/src/bun/core/{GpuWindow,WGPUView}.ts` |
| Build pipeline | `package/build.ts` |
| Bundle config types | `package/src/bun/ElectrobunConfig.ts`, `core/BuildConfig.ts` |
| Self-extractor | `package/src/extractor/main.zig` |
| Launcher | `package/src/launcher/main.{zig,ts}` |
| Zig core (FFI host) | `package/src/core/main.zig` |
| Zig SDK (zig-as-main) | `package/src/zig-sdk/electrobun.zig` |
| Native wrappers | `package/src/native/{macos,linux,win}/nativeWrapper.{mm,cpp}` |
| Shared C headers | `package/src/native/shared/*.h` |

## Versions pinned in upstream

From `package/src/shared/{bun-version,cef-version,electrobun-version}.ts`:

- Electrobun: `1.18.4-beta.3`
- Bun: `1.3.13`
- CEF: `147.0.10+gd58e84d` (Chromium 147.0.7727.118)

## Platform support

| OS | Status |
|---|---|
| macOS 14+ | Official |
| Windows 11+ | Official |
| Ubuntu 22.04+ | Official |
| Other Linux (gtk3, webkit2gtk-4.1) | Community |
| Raspberry Pi | Unofficial fork: `kortexa-ai/electrobun` (linux-wpe branch) |

— `.cache/electrobun/README.md:170-178`

## Live deepwiki recipes

```text
# Topic page
mcp__deepwiki__read_wiki_contents repoName="blackboardsh/electrobun"
# Specific question
mcp__deepwiki__ask_question repoName="blackboardsh/electrobun" question="How does the launcher decide between bun and zig main?"
```

If the answer needs source verification, grep `.cache/electrobun/` and cite `file:line`.
