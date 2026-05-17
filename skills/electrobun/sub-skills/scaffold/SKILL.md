---
name: electrobun-scaffold
description: Start a new Electrobun app. Use when the user asks to create, initialize, scaffold, or bootstrap an Electrobun project, picks a starter template, or asks about the structure of `electrobun.config.ts`. Covers `bunx electrobun init`, the 19 official templates, the standard project layout, and the minimum viable config.
---

# Scaffold — start a new Electrobun app

**Electron analog:** `electron-forge init` / `create-electron-app`.

## Default path: `bunx electrobun init`

```bash
bunx electrobun init
# Interactive template picker → pick one → enter app name
cd my-app
bun install
bun start
```

`bunx electrobun init` shows a template picker, asks for an app name + identifier, scaffolds the chosen template, and writes a tailored `electrobun.config.ts`. Source: `.cache/electrobun/package/src/cli/index.ts` (CLI dispatch) + `.cache/electrobun/templates/` (template dirs copied verbatim).

If they want to skip the picker and pick a specific template programmatically, point them at <https://github.com/blackboardsh/electrobun/tree/main/templates>.

## The 19 templates (`.cache/electrobun/templates/`)

| Template | Stack | When to suggest |
|---|---|---|
| `hello-world` | vanilla TS | smallest viable starter, no framework |
| `vanilla-vite` | vanilla TS + Vite | TS + Vite, no UI framework |
| `tailwind-vanilla` | vanilla + Tailwind | static UI, no framework |
| `react-tailwind-vite` | React + Tailwind + Vite | most common React starter |
| `svelte` | Svelte | Svelte fans |
| `vue` | Vue 3 | Vue fans |
| `solid` | SolidJS | Solid fans |
| `angular` | Angular | Angular fans (rare for desktop) |
| `multi-window` | vanilla, 2 windows | learn how to manage multiple `BrowserWindow`s |
| `multitab-browser` | vanilla, tabs | learn `<electrobun-webview>` OOPIF tag |
| `notes-app` | vanilla notes UI | small reference app for layout + state |
| `photo-booth` | camera + photo | uses macOS camera entitlement |
| `sqlite-crud` | SQLite + UI | uses `bun:sqlite` from main process |
| `tray-app` | menu-bar / tray app | uses `Tray` + transparent window |
| `bunny` | mascot demo | small playful demo |
| `wgpu` | bare WebGPU | `<electrobun-wgpu>` + native GpuWindow |
| `wgpu-threejs` | Three.js on WGPU | Three.js bun adapter |
| `wgpu-babylon` | Babylon.js on WGPU | Babylon.js bun adapter |
| `wgpu-mlp` | ML inference on WGPU | MLP demo, WebGPU compute |

Pick by primary stack first, secondary need second. If the user wants WebGPU + a framework, lean on a framework template and add the wgpu pieces from the wgpu template.

## Project layout (after `init`)

```
my-app/
├── electrobun.config.ts        # build config (single source of truth)
├── package.json                # has "electrobun" as dep
├── tsconfig.json
├── bun.lock
├── icon.iconset/               # macOS app icons (optional)
├── assets/                     # arbitrary assets, copied by build
├── src/
│   ├── bun/
│   │   └── index.ts            # MAIN PROCESS entrypoint (Bun runtime)
│   └── mainview/
│       ├── index.ts            # default view entry (browser-side, TS)
│       ├── index.html          # default view HTML
│       └── index.css           # default view CSS (optional)
└── scripts/
    └── buildScript.ts          # optional postBuild hook
```

Source for canonical layout: `.cache/electrobun/templates/hello-world/` and `.cache/electrobun/kitchen/` (the kitchen-sink reference app).

The `src/bun/` ↔ `src/mainview/` split is the convention. Main process code lives in `src/bun/`, every view's renderer code lives in `src/<viewname>/`. Multiple views = multiple sibling dirs under `src/`.

## Minimum viable `electrobun.config.ts`

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Hello",
    identifier: "com.example.hello",
    version: "0.1.0",
  },
  build: {
    mainProcess: "bun",                              // "bun" | "zig"
    bun: { entrypoint: "src/bun/index.ts" },
    views: {
      mainview: { entrypoint: "src/mainview/index.ts" },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
    },
    mac:   {},   // platform overrides go here
    linux: {},
    win:   {},
  },
} satisfies ElectrobunConfig;
```

The `satisfies ElectrobunConfig` clause is the type-safe pattern — gives autocomplete + structural checking without widening the literal type. From `.cache/electrobun/kitchen/electrobun.config.ts:1,209`.

## Adding a second view

1. Add the view dir: `src/secondview/{index.ts,index.html}`.
2. Register it in `build.views`:
   ```ts
   views: {
     mainview:   { entrypoint: "src/mainview/index.ts" },
     secondview: { entrypoint: "src/secondview/index.ts" },
   },
   ```
3. Add the HTML copy rule:
   ```ts
   copy: {
     "src/mainview/index.html":   "views/mainview/index.html",
     "src/secondview/index.html": "views/secondview/index.html",
   },
   ```
4. Open it from bun: `new BrowserWindow({ url: "views://secondview/index.html" })`.

The `views://` scheme is electrobun's analog to Electron's `file://app/...` — but resolved natively + bundled.

## `app.identifier`

Reverse-DNS format. Used as macOS bundle id, Linux `.desktop` `Exec`/`Icon` references, Windows registry keys. Pick once at scaffold and never change — changing it invalidates the user's existing app data path (`Electrobun.PATHS.RESOURCES_FOLDER` resolves from it).

## `app.urlSchemes`

```ts
app: {
  // ...
  urlSchemes: ["myapp"],
},
```

Registers `myapp://` as a custom protocol the OS routes to your app. Bun side: `Electrobun.events.app.on("open-url", e => ...)`. Available since v1.18.0 (see `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-18-0.mdx`).

## `app.fileAssociations` (v1.18.0+)

Register file extensions your app opens (e.g. `.myproj`). OS double-click → routed via `open-url` event. Set per-platform if needed.

## Common gotchas at scaffold time

1. **Don't run `electrobun` directly from `node_modules/.bin/electrobun`.** Use `bunx electrobun` or the npm scripts. From `.cache/electrobun/CLAUDE.md:7` — same instruction the upstream maintainer gives.
2. **Use Bun, not Node.** Electrobun scripts assume `bun install` and `bun run`. Node will work for CLI invocations but breaks scripts that rely on Bun-only APIs (`Bun.file`, `bun:sqlite`).
3. **`bunVersion` and `cefVersion`** in `build` block let you pin specific versions — usually leave them off and inherit from the installed `electrobun` package.
4. **`postBuild` script** runs after every build. Keep it idempotent. Common use: code-sign extra binaries, attach metadata, push artifacts to a CDN.

## Live recipes

```text
mcp__context7__query-docs libraryId="/blackboardsh/electrobun" query="electrobun.config.ts complete example with all platform options"
mcp__deepwiki__ask_question  repoName="blackboardsh/electrobun" question="What is the difference between mainProcess: 'bun' and 'zig'?"
```

For `mainProcess: "zig"`, see [`zig-main`](../zig-main/SKILL.md).
For building + distributing, see [`build-dist`](../build-dist/SKILL.md).
For adding webviews, see [`views`](../views/SKILL.md).
For IPC between bun and webview, see [`ipc-rpc`](../ipc-rpc/SKILL.md).
