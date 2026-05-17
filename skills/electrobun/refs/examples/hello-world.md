---
source: .cache/electrobun/templates/hello-world/
upstream_sha: 9e421ff2c9c987c6935aa1679348ec91e66b2af1
captured_at: 2026-05-17
---

# Minimal Electrobun app — hello-world

Smallest viable starter. Single window, single view, no framework. Copy this layout for any new app.

## File tree

```
hello-world/
├── electrobun.config.ts
├── package.json
├── tsconfig.json
└── src/
    ├── bun/
    │   └── index.ts
    └── mainview/
        ├── index.ts
        ├── index.html
        └── index.css
```

## `package.json`

```json
{
  "name": "hello-world",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "electrobun dev",
    "build": "electrobun build:release"
  },
  "dependencies": {
    "electrobun": "^1.18.4-beta.3"
  }
}
```

## `electrobun.config.ts`

```ts
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Hello World",
    identifier: "com.example.hello-world",
    version: "0.1.0",
  },
  build: {
    mainProcess: "bun",
    bun:   { entrypoint: "src/bun/index.ts" },
    views: { mainview: { entrypoint: "src/mainview/index.ts" } },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css":  "views/mainview/index.css",
    },
    mac:   {},
    linux: {},
    win:   {},
  },
} satisfies ElectrobunConfig;
```

## `src/bun/index.ts`

```ts
import { BrowserWindow } from "electrobun/bun";

new BrowserWindow({
  url: "views://mainview/index.html",
  width: 800,
  height: 600,
  title: "Hello World",
});
```

## `src/mainview/index.html`

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="index.css" />
    <script type="module" src="index.ts"></script>
  </head>
  <body>
    <h1>Hello, world!</h1>
    <p id="count">0</p>
    <button id="bump">+1</button>
  </body>
</html>
```

## `src/mainview/index.ts`

```ts
import { Electroview } from "electrobun/view";

new Electroview({ rpc: undefined });

const count = document.getElementById("count")!;
const bump  = document.getElementById("bump")!;
let n = 0;
bump.addEventListener("click", () => { count.textContent = String(++n); });
```

## Run

```bash
bun install
bun start
```

## Why this layout

- `src/bun/` for main-process code. `src/<viewname>/` for each view's renderer.
- `electrobun.config.ts` is the single source of truth. Build = compile config.
- `Electroview` is required in every view, even with `rpc: undefined`, because it wires up the preload bridges.
