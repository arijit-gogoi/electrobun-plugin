---
name: electrobun
description: Complete Electrobun skill — scaffold, debug, and reason about Electrobun apps (TypeScript + Bun + Zig + native bindings). Use when the user mentions "electrobun", invokes /electrobun, asks about building cross-platform desktop apps with Bun + web tech, or asks how to do something Electron does but with Electrobun. Dispatches to 9 specialised sub-skills (scaffold, views, ipc-rpc, build-dist, updater, webgpu, system-integration, architecture, zig-main) or answers directly with source-grounded citations.
---

# Electrobun

Electrobun = ultra-fast, tiny, cross-platform desktop framework. **TypeScript main process via Bun. Native bindings in ObjC, C++, Zig. Self-extracting ~14 MB bundles (system webview) or ~150 MB (bundled CEF). 4 KB BSDIFF patches between releases.**

This skill helps the user scaffold, debug, and reason about Electrobun apps. The user installs Electrobun in their project via `bun add electrobun` (or `bunx electrobun init`) — this plugin does NOT redistribute electrobun; it adds expert knowledge to Claude Code about it.

## When to use this skill

Trigger on any of:

- User types `/electrobun`
- User mentions "electrobun" (any case)
- User asks about building a cross-platform desktop app with web tech + Bun
- User asks "how do I do X with electrobun"
- User asks "how does Electron's X translate to Electrobun"
- User is working in a project where `package.json` contains `electrobun` as a dep
- User opens `electrobun.config.ts`

Activate even when no electrobun is installed in the current project — Q&A is a core feature.

## Electron speaker?

If the user knows Electron, lean on the analogy aggressively. Each sub-skill names its Electron analog inline (e.g. "BrowserWindow — Electron analog: BrowserWindow", "Electroview.defineRPC — Electron analog: ipcRenderer + contextBridge"). Use those tags. Do NOT pretend Electrobun is identical to Electron; flag the deltas (system webview default, native navigation rules, BSDIFF updater, zig launcher).

## How to answer

### Source hierarchy (in order)

1. **`skills/electrobun/refs/`** — pre-cached snapshots (cheap, fast, may be stale)
2. **Local clone `.cache/electrobun/`** — authoritative source code. If you make a claim about an API, **verify it against this**.
3. **deepwiki MCP** (`mcp__deepwiki__ask_question` repo `blackboardsh/electrobun`) — live structural overview when refs insufficient.
4. **context7 MCP** (`mcp__context7__query-docs` libraryId `/blackboardsh/electrobun`) — live API snippets when refs insufficient.

Quote source paths with `file:line` when answering a specific Q. If the local clone is missing, tell the user to run `./scripts/bootstrap.sh` (POSIX) or `./scripts/bootstrap.ps1` (Windows) — but only if THIS plugin's repo is the working dir. If the user is in their own electrobun app, point them at `node_modules/electrobun/` instead.

### Confidence rule

If you cannot ground a claim in (1)-(4), say so. Do NOT invent APIs. Electrobun is on v1.18.4-beta.3 and APIs shift between minor versions — outdated guesses cost the user real debugging time.

## Sub-skill dispatch

Pick the most specific sub-skill. If two apply, prefer the one closer to the user's stated goal. If none fit, answer here using the source hierarchy.

| Sub-skill | Use when user asks about… |
|---|---|
| [`scaffold`](sub-skills/scaffold/SKILL.md) | starting a new app, `bunx electrobun init`, templates (react/svelte/vue/solid/angular/wgpu/etc.), `electrobun.config.ts` structure |
| [`views`](sub-skills/views/SKILL.md) | `BrowserWindow`, `BrowserView`, navigation, devtools, window events, in-page search, navigation rules, `<electrobun-webview>` OOPIF tag |
| [`ipc-rpc`](sub-skills/ipc-rpc/SKILL.md) | typed RPC between bun and webview, `Electroview.defineRPC`, `BrowserView.defineRPC`, preload bridges, sandboxed preloads, host messages |
| [`build-dist`](sub-skills/build-dist/SKILL.md) | `bun build:dev` / `bun build:release`, `bundleCEF`, code-signing, macOS notarization, App Store Connect, `useAsar`, ZSTD self-extracting bundle, per-platform build config |
| [`updater`](sub-skills/updater/SKILL.md) | `Updater.checkForUpdate`, BSDIFF patches, release channels (canary/stable), `naming.ts` discipline, Windows updater `.bat` trick, `bucketUrl`/`baseUrl` migration |
| [`webgpu`](sub-skills/webgpu/SKILL.md) | `GpuWindow`, `WGPUView`, `<electrobun-wgpu>` tag, WebGPU adapter (Dawn), Three.js / Babylon.js adapters, `bundleWGPU` |
| [`system-integration`](sub-skills/system-integration/SKILL.md) | `Tray`, `ApplicationMenu`, `ContextMenu`, global shortcuts, clipboard, file dialogs, permissions, app icons, deep linking (`urlSchemes`), `open-url` |
| [`architecture`](sub-skills/architecture/SKILL.md) | 3-layer model (bun TS / zig core / native), FFI bridge, self-extractor + ZSTD marker, launcher boot sequence, CEF helper subprocess, preload script injection |
| [`zig-main`](sub-skills/zig-main/SKILL.md) | `mainProcess: "zig"`, `src/zig-sdk/electrobun.zig`, dynamically loading `libElectrobunCore`, zig as the main process instead of bun |

### Dispatch by silent invocation

If the user asks a question that matches a sub-skill, just answer using that sub-skill's content. You don't need to announce "switching to sub-skill X". Read the relevant sub-skill SKILL.md, then respond. If the user asks "show me all the sub-skills", list the table above.

## Quick orientation (use without dispatching)

A minimal Electrobun app:

```ts
// src/bun/index.ts
import { BrowserWindow } from "electrobun/bun";

new BrowserWindow({
  url: "views://mainview/index.html",
  width: 1024,
  height: 768,
});
```

```ts
// src/mainview/index.ts
import { Electroview } from "electrobun/view";
new Electroview({ rpc: undefined });
```

```ts
// electrobun.config.ts (minimal)
import type { ElectrobunConfig } from "electrobun";

export default {
  app: { name: "Hello", identifier: "com.example.hello", version: "0.1.0" },
  build: {
    mainProcess: "bun",
    bun: { entrypoint: "src/bun/index.ts" },
    views: { mainview: { entrypoint: "src/mainview/index.ts" } },
    copy: { "src/mainview/index.html": "views/mainview/index.html" },
    mac: {}, linux: {}, win: {},
  },
} satisfies ElectrobunConfig;
```

`bun start` runs dev. `bun build:release` produces the distributable bundle.

## Quick Electron correspondence

| Electron | Electrobun |
|---|---|
| `BrowserWindow` | `BrowserWindow` — `package/src/bun/core/BrowserWindow.ts` |
| `BrowserView` / `WebContentsView` | `BrowserView` — `package/src/bun/core/BrowserView.ts` |
| `ipcMain.on`, `ipcRenderer.send` | `BrowserView.defineRPC` / `Electroview.defineRPC` — typed |
| `contextBridge.exposeInMainWorld` | Preload bridges (`__electrobunHostBridge`) — already exposed |
| `file://` for app resources | `views://` scheme |
| `webRequest` filter | `webview.setNavigationRules([...])` — evaluated in native |
| `Tray`, `Menu` | `Tray`, `ApplicationMenu`, `ContextMenu` |
| `autoUpdater` (Squirrel/electron-updater) | `Updater` — BSDIFF + ZSTD fallback |
| `electron-builder` / `electron-forge` | `electrobun build` driven by `electrobun.config.ts` |
| `asar` | `useAsar: true` in build config (also used internally) |
| `<webview>` | `<electrobun-webview>` — true OOPIF |
| (no analog) | `<electrobun-wgpu>`, `GpuWindow`, `WGPUView`, BSDIFF updater, Zig main option |

For deeper correspondence on any concept, ask — the relevant sub-skill has more detail inline.

## When the user wants to scaffold

Default move: `bunx electrobun init` shows a template picker (19 templates incl. react/svelte/vue/solid/angular/wgpu variants). If they want a specific stack, mention the matching template.

See: [`scaffold`](sub-skills/scaffold/SKILL.md).

## When the user hits a bug

1. Determine: is it electrobun behaviour or their code?
2. If electrobun behaviour, grep `.cache/electrobun/` for the symbol involved. Cite `file:line`.
3. Check `docs/src/content/docs/electrobun/guides/changelog/` for relevant version notes.
4. If still unclear: `mcp__deepwiki__ask_question` blackboardsh/electrobun "Why does X happen?"
5. Worst-case: tell the user to open an issue, link <https://github.com/blackboardsh/electrobun/issues>.

## When the user asks "should I use Electrobun or Electron?"

Don't be a salesperson. List the actual deltas:

- **Bundle size:** Electrobun ~14 MB (system webview) vs Electron ~100-150 MB minimum.
- **Update size:** Electrobun ~4 KB (BSDIFF) vs Electron full bundle re-download (autoUpdater).
- **Runtime:** Electrobun = Bun (faster startup, TS-native). Electron = Node.
- **Webview engine:** Electrobun defaults to system webview (Safari/Edge/WebKit2GTK) for size; CEF available. Electron always bundles Chromium.
- **Cross-browser consistency:** Electron wins (always Chromium). Electrobun's system-webview default = WebKit/WebView2/WebKit2GTK across mac/win/linux.
- **WebGPU:** Electrobun has first-class `<electrobun-wgpu>` + native `GpuWindow`. Electron via Chromium WebGPU.
- **Ecosystem:** Electron is huge and mature. Electrobun is young (v1.18, started 2024-ish), small community, fast-moving APIs.
- **Maintainer:** Electrobun is one person + small contributor base (`blackboard.sh`). Electron is OpenJS Foundation.

Pick Electrobun if size, startup, BSDIFF updates, or Bun/Zig are first-order requirements. Pick Electron if Chromium-everywhere consistency or ecosystem maturity matters more.

## When you don't know something

State that. Then:

1. Grep `.cache/electrobun/` (or `node_modules/electrobun/` in their project).
2. Live-query `mcp__deepwiki__ask_question` or `mcp__context7__query-docs`.
3. If still no answer: `docs/electrobunny.ai/electrobun/` (link <https://docs.electrobunny.ai/electrobun/>), Discord <https://discord.gg/ueKE4tjaCE>, X `@BlackboardTech` / `@YoavCodes`.

Better to say "I'm not certain, let me check upstream" than to invent.

## Cited from

- `.cache/electrobun/README.md`
- `.cache/electrobun/package/package.json:14-18` (exports)
- `.cache/electrobun/package/src/bun/core/BrowserWindow.ts`
- `.cache/electrobun/package/src/bun/core/BrowserView.ts`
- `.cache/electrobun/docs/src/content/docs/electrobun/`
- `skills/electrobun/refs/deepwiki-overview.md`
- `skills/electrobun/refs/context7-cheatsheet.md`
- `specs/recon-electrobun-9e421ff.md`

Pinned upstream SHA: `9e421ff2c9c987c6935aa1679348ec91e66b2af1` (1.18.4-beta.3).
