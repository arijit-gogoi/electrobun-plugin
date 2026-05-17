---
name: electrobun-webgpu
description: Native WebGPU rendering via Dawn — `GpuWindow`, `WGPUView`, the `<electrobun-wgpu>` HTML tag, the bun-side WebGPU adapter that mirrors the W3C API, and Three.js / Babylon.js adapters that work directly in Bun. Use when the user asks about WebGPU, 3D rendering, native GPU surfaces, compositing GPU canvases into webviews, Three.js / Babylon.js on Bun, `bundleWGPU`, or zero-copy DirectComposition / Metal layers.
---

# WebGPU — native GPU surfaces in an Electrobun app

**Electron analog: none.** Electron exposes Chromium's WebGPU inside a webview only — same as any web page. Electrobun adds: (a) a native GPU window (`GpuWindow`) with **no webview**, (b) a composited GPU surface tag (`<electrobun-wgpu>`) that lives inside a webview, (c) a bun-side WebGPU API (`webgpuAdapter.ts`) that mirrors the W3C `GPU*` classes so you can drive GPU from the main process, (d) Three.js + Babylon.js adapters that work in Bun's runtime.

## Three ways to use WebGPU in electrobun

| Mechanism | Process | Where the GPU code runs | Use when |
|---|---|---|---|
| Standard `navigator.gpu` in a webview | webview | renderer (Chromium WebGPU) | you just want WebGPU like any web page |
| `<electrobun-wgpu>` HTML tag | webview + native | bun-driven, native composit | you want a GPU surface inside an HTML layout |
| `GpuWindow` + `WGPUView` | bun + native | bun-driven, no webview at all | you want a window with zero web stack overhead — perfect for native 3D / shader / ML demos |

Source: `.cache/electrobun/package/src/bun/{webGPU,webgpuAdapter}.ts`, `.cache/electrobun/package/src/bun/core/{GpuWindow,WGPUView}.ts`, `.cache/electrobun/package/src/browser/wgputag.ts`.

## Enable WebGPU bundling

```ts
// electrobun.config.ts
build: {
  mac:   { bundleWGPU: true },
  linux: { bundleWGPU: true },
  win:   { bundleWGPU: true },
}
```

Ships the Dawn (Google's WebGPU implementation) native library. Adds ~20 MB to the bundle. Required for `GpuWindow` and `<electrobun-wgpu>`. **Not** required for standard webview WebGPU (Chromium has its own).

## Pattern A: standard webview WebGPU

```html
<canvas id="c"></canvas>
<script type="module">
  const adapter = await navigator.gpu.requestAdapter();
  const device  = await adapter.requestDevice();
  const canvas  = document.getElementById("c");
  const ctx     = canvas.getContext("webgpu");
  // ... standard W3C WebGPU
</script>
```

Works in any electrobun webview (system webview if available; CEF if `bundleCEF: true` and Chromium 113+).

## Pattern B: `<electrobun-wgpu>` tag — composited native GPU in HTML

```html
<!-- inside a view's HTML -->
<electrobun-wgpu id="canvas" style="width: 800px; height: 600px;"></electrobun-wgpu>
```

```ts
// from the parent webview's JS — but the GPU code actually runs on the bun side via RPC
const tag = document.getElementById("canvas") as ElectrobunWgpuTag;
// position/size auto-sync to native surface via OverlaySync
```

```ts
// from the bun side — drive the GPU using webgpuAdapter
import { WebGPU } from "electrobun/bun";   // verify exact export name
import * as THREE from "three";

const view = WebGPU.getViewForTag("canvas");   // pseudo — see kitchen/src/playgrounds/wgpu-tag/
// then standard Three.js with bun-side webgpu adapter
```

Real example: `.cache/electrobun/kitchen/src/playgrounds/wgpu-tag/`.

The HTML tag and the native GPU surface stay in sync via `OverlaySync` (resize/move). Source: `.cache/electrobun/package/src/bun/preload/overlaySync.ts`.

## Pattern C: `GpuWindow` — no webview, pure native GPU

```ts
import { GpuWindow } from "electrobun/bun";

const win = new GpuWindow({
  title: "GPU Window",
  width: 1024,
  height: 768,
});

// GpuWindow auto-creates an attached WGPUView
const view = win.view;
// ... drive the GPU from bun
```

Use when you want a window that's just a GPU surface — no HTML, no JS in a webview, no Chromium. Best for: native 3D demos, ML inference visualisations, shader playgrounds.

Source: `.cache/electrobun/package/src/bun/core/{GpuWindow,WGPUView}.ts`. The bun-side handle is a JS wrapper around a native pointer; `WGPUView.adoptExisting` rehydrates from a known pointer (useful for split processes).

## The bun-side WebGPU adapter

`.cache/electrobun/package/src/bun/webgpuAdapter.ts` defines ~17 JS classes that mirror the W3C WebGPU API:

- `GPUDevice`, `GPUAdapter`, `GPUQueue`
- `GPUCommandEncoder`, `GPUCommandBuffer`
- `GPURenderPassEncoder`, `GPUComputePassEncoder`
- `GPUBuffer`, `GPUTexture`, `GPUTextureView`, `GPUSampler`
- `GPUBindGroup`, `GPUBindGroupLayout`, `GPUPipelineLayout`
- `GPURenderPipeline`, `GPUComputePipeline`
- `GPUShaderModule`
- `GPUCanvasContext` (canvas shim — see `createCanvasShim()`)

These call into the native Dawn library via FFI (`webGPU.ts` dlopens the Dawn lib). The API is **as close to W3C as feasible** — most W3C examples work with minor import-path tweaks.

## Three.js on Bun

The official `wgpu-threejs` template (`.cache/electrobun/templates/wgpu-threejs/`) shows the pattern:

```ts
import * as THREE from "three";
import { GpuWindow, WebGPU } from "electrobun/bun";

const win    = new GpuWindow({ width: 1024, height: 768 });
const canvas = createCanvasShim(win.view);    // shim that quacks like HTMLCanvasElement
const renderer = new THREE.WebGPURenderer({ canvas });

// then standard Three.js
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1024/768, 0.1, 1000);
// ...
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

The trick: `createCanvasShim` (in `webgpuAdapter.ts`) creates an object that responds to `canvas.getContext("webgpu")` with a real `GPUCanvasContext` backed by Dawn — Three.js can't tell the difference.

## Babylon.js on Bun

Same pattern with `BABYLON.Engine` + `WebGPUEngine`. Template: `wgpu-babylon`. Test: `.cache/electrobun/kitchen/src/tests/babylon-adapter.test.ts`.

## ML inference on WGPU (compute shaders)

`wgpu-mlp` template demonstrates MLP forward pass via compute shaders running on Dawn. Pattern is standard WebGPU compute — `device.createComputePipeline`, dispatch workgroups, read back the buffer.

## Windows DirectComposition fast path (v1.18.0+)

Windows uses `D3D11On12` from Dawn for **zero-copy WebGPU swap-chain present**. Source: `.cache/electrobun/package/src/native/win/dcomp_compositor.h`. v1.18.0 changelog reports the jump from ~48 FPS to ~1729 FPS for canvas surfaces after this landed: `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-18-0.mdx`. macOS uses CAMetalLayer; Linux uses similar surface mechanisms.

## When does electrobun's WebGPU outperform a normal webview?

When you can skip the Chromium → V8 → WebGPU bridge entirely. `GpuWindow` is bun TS → FFI → Dawn → native present. No V8, no DOM, no compositor for non-GPU layers. Cold-start and per-frame latency both drop.

For `<electrobun-wgpu>` tags, the win is **compositing**: the GPU surface is presented natively under the webview, so a 4K Three.js scene doesn't burn CPU on web-canvas paint.

## Common gotchas

1. **`bundleWGPU: true` is mandatory** for `GpuWindow` / `<electrobun-wgpu>`. Without it, the Dawn lib isn't shipped → runtime error at GPU init.
2. **`createCanvasShim`** is the bridge to web-shaped APIs. Three.js / Babylon expect an HTMLCanvasElement-like object — the shim provides it.
3. **No DOM in `GpuWindow`.** It's a pure GPU surface. No `document`, no `window` (well, the bun `globalThis`), no events except the ones `GpuWindow` exposes (resize/close).
4. **Adapter / device lifetime.** `GPUDevice` is heavy; create once per `GpuWindow`, reuse. Disposing then re-requesting per frame will tank perf.
5. **`<electrobun-wgpu>` size sync** uses `ResizeObserver` + adaptive interval. If you animate the tag's CSS size at high fps, expect a few frames of stale GPU sizing — the native side reacts on the next sync tick.
6. **Texture format mismatches** between W3C and Dawn → check `device.requestDevice()` features and limits. Dawn occasionally lags behind the latest W3C spec drafts.

## Live recipes

```text
mcp__context7__query-docs   libraryId="/blackboardsh/electrobun" query="GpuWindow WGPUView complete example with custom render loop"
mcp__deepwiki__ask_question repoName="blackboardsh/electrobun" question="Which WebGPU features are unsupported in the bun adapter vs Chromium?"
```

## Cited from

- `.cache/electrobun/package/src/bun/{webGPU,webgpuAdapter}.ts` — bun-side adapter
- `.cache/electrobun/package/src/bun/core/{GpuWindow,WGPUView}.ts`
- `.cache/electrobun/package/src/browser/wgputag.ts` — custom element
- `.cache/electrobun/package/src/bun/preload/overlaySync.ts` — GPU/webview compositing sync
- `.cache/electrobun/package/src/native/win/dcomp_compositor.h` — Windows zero-copy
- `.cache/electrobun/package/scripts/gen-webgpu-ffi.mjs` — FFI binding generator
- `.cache/electrobun/docs/src/content/docs/electrobun/apis/webgpu.mdx`
- `.cache/electrobun/docs/src/content/docs/electrobun/apis/browser/electrobun-wgpu-tag.mdx`
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-15-1.mdx` — WGPU stack landing
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-18-0.mdx` — DirectComposition perf
- `.cache/electrobun/kitchen/src/playgrounds/wgpu-tag/`
- `.cache/electrobun/kitchen/src/tests/{wgpu-adapter,wgpu-adapter-extended,wgpu-ffi,babylon-adapter}.test.ts`
- `.cache/electrobun/templates/{wgpu,wgpu-threejs,wgpu-babylon,wgpu-mlp}/`
