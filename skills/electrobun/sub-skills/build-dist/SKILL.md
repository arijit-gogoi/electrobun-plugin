---
name: electrobun-build-dist
description: Build and distribute Electrobun apps. Covers `bun build:dev` / `bun build:release`, the build pipeline, `bundleCEF`, `bundleWGPU`, `useAsar`, ZSTD self-extracting bundles, macOS code-signing + notarization + App Store Connect, Windows code-signing, Linux `.desktop` integration, postBuild scripts. Use when the user asks how to build a release, ship a binary, sign or notarize, pick between system webview and CEF, or understand the bundle structure.
---

# Build & distribute

**Electron analogs:**
- `electron-builder` / `electron-forge make` → `bun build:release` driven by `electrobun.config.ts`
- `electron-builder.yml` → the `build` block in `electrobun.config.ts`
- ASAR archive → `useAsar: true` (electrobun also uses asar internally)
- Squirrel installer → ZSTD self-extracting binary (no separate installer needed on mac/linux)

## Build commands

```bash
# Dev — watches + rebuilds + runs
bun dev

# Release — fully bundled, code-signed (if configured), notarized
bun build:release

# Canary channel
bun dev:canary
bun build:canary       # if you've added it to scripts
```

Internally (the upstream package), these dispatch to `package/build.ts`. In a user app, they call the `electrobun` CLI which reads `electrobun.config.ts`. Source: `.cache/electrobun/package/src/cli/index.ts` + `.cache/electrobun/package/build.ts`.

## The build pipeline (what `bun build:release` actually does)

From `.cache/electrobun/package/build.ts` (~26 functions, simplified):

```
setup()
  → vendorBun()              // fetch+pin Bun binary
  → vendorZig()              // fetch+pin Zig toolchain
  → vendorCEF()              // if bundleCEF
build()
  → buildNative()            // compile per-platform nativeWrapper.{mm,cpp}
  → buildCore()              // compile zig core (FFI bridge)
  → buildLauncher()          // compile zig launcher (boot entry)
  → buildCli()               // compile CLI tool
  → buildMainJs()            // bundle src/bun/* via Bun
  → buildPreload()           // bundle preload scripts
  → buildSelfExtractor()     // wrap everything in ZSTD self-extracting binary
copyToDist()                  // → dist/<platform>/<arch>/
postBuild()                   // run user's scripts.postBuild
```

End result: one binary per (platform, arch) under `dist/`. Mac gets `.app` bundle; Windows gets `.exe`; Linux gets ELF executable + `.desktop` file.

## Renderer choice: system webview vs CEF

```ts
// electrobun.config.ts
build: {
  mainProcess: "bun",
  mac:   { bundleCEF: false, defaultRenderer: "system" },  // ~14 MB
  // vs
  mac:   { bundleCEF: true,  defaultRenderer: "cef"    },  // ~150 MB
}
```

| | System webview | Bundled CEF |
|---|---|---|
| Bundle size | ~14 MB | ~150 MB |
| Consistency across mac/win/linux | low (WebKit / WebView2 / WebKit2GTK) | high (Chromium everywhere) |
| Update size (BSDIFF) | ~4-50 KB typical | similar deltas |
| Performance | excellent | excellent |
| Web platform features | OS-dependent | Chromium full |
| When to pick | small download, OS-native feel | need exact rendering parity |

Set per-platform — you can bundle CEF on Windows + Linux but use system webview on macOS, etc.

## Per-platform overrides — the full surface

```ts
// electrobun.config.ts
build: {
  mainProcess: "bun",                       // or "zig"
  useAsar: true,                            // wrap bun/index.js in app.asar
  bun: { entrypoint: "src/bun/index.ts" },
  zig: { entrypoint: "src/zig/main.zig" }, // only if mainProcess: "zig"
  views: { /* ... */ },
  copy:  { /* ... */ },

  mac: {
    codesign: true,
    notarize: true,
    bundleCEF: true,
    bundleWGPU: true,
    defaultRenderer: "cef",
    entitlements: {
      "com.apple.security.device.camera":     "Camera for video features",
      "com.apple.security.device.microphone": "Mic for audio features",
      "com.apple.security.network.client":    "Network access",
    },
    chromiumFlags: { "user-agent": "MyApp/1.0 (Macintosh)" },
    icons: "App.icon",                      // .icon (v1.18.0+) or "icon.iconset"
  },

  linux: {
    bundleCEF: true,
    bundleWGPU: true,
    defaultRenderer: "cef",
    icon: "icon.iconset/icon_256x256.png",
    chromiumFlags: { "user-agent": "MyApp/1.0 (Linux)" },
  },

  win: {
    bundleCEF: true,
    bundleWGPU: true,
    defaultRenderer: "cef",
    icon: "icon.iconset/icon_256x256.png",
    chromiumFlags: { "user-agent": "MyApp/1.0 (Windows)" },
  },
},

scripts: { postBuild: "./buildScript.ts" },

release: {
  baseUrl: "https://static.example.com/myapp/",   // for updater
  generatePatch: true,                            // emit BSDIFF patches
},
```

Source: `.cache/electrobun/kitchen/electrobun.config.ts` (canonical example) + `.cache/electrobun/package/src/bun/ElectrobunConfig.ts` (type).

## macOS code-signing + notarization

```ts
mac: {
  codesign: true,
  notarize: true,
}
```

Required environment for `notarize`:

```bash
export ELECTROBUN_APPLE_ID="you@example.com"
export ELECTROBUN_APPLE_APP_PASSWORD="app-specific-password"
export ELECTROBUN_APPLE_TEAM_ID="ABCDE12345"
# Identity to sign with — pass full SHA-1 from `security find-identity -v -p codesigning`
export ELECTROBUN_APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ABCDE12345)"
```

Names of env vars may differ; check `.cache/electrobun/package/src/cli/*` or `docs/src/content/docs/electrobun/guides/code-signing.mdx` for current. If the build complains about identity, run:

```bash
security find-identity -v -p codesigning
```

For **App Store Connect** distribution (added v1.18.0): mac config supports notarizing via App Store Connect API key in addition to the legacy app-specific-password method. Check the v1.18.0 changelog: `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-18-0.mdx`.

**Electron analog:** `electron-builder mac.notarize` block. Electrobun's version is leaner (no `electron-notarize` separate package).

## Windows code-signing

```ts
win: {
  codesign: true,    // verify exact flag name in CLI source
}
```

Expects an `.pfx` or hardware-token signing setup. Env vars: `ELECTROBUN_WIN_CERT_FILE`, `ELECTROBUN_WIN_CERT_PASSWORD` (or similar — verify). Uses `signtool.exe` under the hood.

## Linux signing

Linux doesn't have a native signing requirement at install time, but you can ship a `.deb` / `.rpm` / AppImage with GPG-signed metadata. Electrobun doesn't bundle this — wrap the produced binary yourself, or distribute as a tarball.

## Bundle structure (macOS example)

```
MyApp.app/
├── Contents/
│   ├── Info.plist
│   ├── MacOS/
│   │   └── launcher                # Zig launcher binary
│   ├── Resources/
│   │   ├── app.asar                # bun/index.js (if useAsar: true)
│   │   ├── bun-runtime             # bun binary
│   │   ├── views/                  # all your view HTML/CSS bundles
│   │   ├── assets/                 # everything you copied
│   │   └── build.json              # build metadata for launcher
│   └── Frameworks/                 # CEF if bundleCEF
```

The `launcher` boots, dlopens `libElectrobunCore`, hands off the main thread, then forks the Bun runtime (or zig main) to load `app.asar/bun/index.js`. Source: `.cache/electrobun/package/src/launcher/main.{ts,zig}`.

## ZSTD self-extracting bundle

For first-launch, electrobun produces an outer binary with a ZSTD-compressed payload appended after the `ELECTROBUN_ARCHIVE_V1` marker. The extractor (zig) extracts on first launch into the per-user app data dir, then re-execs the actual launcher. Source: `.cache/electrobun/package/src/extractor/main.zig`.

This is why first-launch is slower than subsequent launches — the extract is one-shot.

## `useAsar`

```ts
build: { useAsar: true }
```

Bundles `bun/index.js` into `app.asar`. Smaller dist, prevents casual tampering. The launcher dlopens `libasar` to read from the archive. Source: `.cache/electrobun/package/src/launcher/main.ts`.

## `postBuild` script

```ts
// buildScript.ts
import type { PostBuildContext } from "electrobun";
export default async (ctx: PostBuildContext) => {
  // ctx has: platform, arch, distPath, version, channel
  console.log(`built ${ctx.platform}/${ctx.arch} → ${ctx.distPath}`);
  // upload, sign extra binaries, attach metadata, etc.
};
```

Runs after `copyToDist`. Use for: CDN upload, attaching `.dSYM` to crash reports, generating release notes.

## Build modes (channels)

```bash
bun build:dev        # debug symbols, no minify, no notarize
bun build:canary     # release, separate channel (canary update stream)
bun build:stable     # release, stable update stream
bun build:release    # default release
```

Channel goes into the artifact filename via `shared/naming.ts` (`.cache/electrobun/package/src/shared/naming.ts`). The updater uses the channel string to find the right manifest at `release.baseUrl`. See [`updater`](../updater/SKILL.md).

## `chromiumFlags`

Pass arbitrary command-line switches to bundled Chromium:

```ts
mac: {
  bundleCEF: true,
  chromiumFlags: {
    "user-agent":              "MyApp/1.0",
    "show-paint-rects":        true,           // debug only
    "disable-gpu":             true,           // emergency fallback
    "enable-features":         "VaapiVideoDecoder",
  },
}
```

Applied by `.cache/electrobun/package/src/native/shared/chromium_flags.h` in `OnBeforeCommandLineProcessing`.

## `bundleWGPU`

```ts
mac: { bundleWGPU: true }
```

Ships the Dawn (Google's WebGPU implementation) native library. Required for `GpuWindow`, `WGPUView`, `<electrobun-wgpu>`. See [`webgpu`](../webgpu/SKILL.md).

## Common gotchas

1. **Build from the `/package` dir if hacking electrobun itself; from your app root if using it.** Mixing them loads the wrong `electrobun.config.ts`.
2. **CEF first build is slow.** Initial vendor step downloads ~250 MB of Chromium. Subsequent builds reuse the cache (`vendors/cef/`).
3. **Notarization is slow.** Apple's servers take 5-30 min. Don't wedge CI on it for canary builds — only notarize stable.
4. **App Store Connect rejects entitlements you don't justify.** Each entitlement value is a human-readable purpose string shown to the user; write real ones.
5. **`icons: "App.icon"` is v1.18.0+** — for older versions use `"icon.iconset"`.
6. **Linux `.desktop` file** is auto-generated v1.18.0+. Older versions: write it yourself in `postBuild`.

## Live recipes

```text
mcp__deepwiki__ask_question repoName="blackboardsh/electrobun" question="What's the exact env var name for the macOS notarize password?"
mcp__context7__query-docs   libraryId="/blackboardsh/electrobun" query="bundleCEF and codesign options for windows"
```

## Cited from

- `.cache/electrobun/package/build.ts` (build pipeline)
- `.cache/electrobun/package/src/cli/index.ts` (CLI dispatch)
- `.cache/electrobun/package/src/bun/ElectrobunConfig.ts` (config type)
- `.cache/electrobun/package/src/bun/core/BuildConfig.ts`
- `.cache/electrobun/package/src/extractor/main.zig` (ZSTD self-extractor)
- `.cache/electrobun/package/src/launcher/main.{ts,zig}` (boot sequence)
- `.cache/electrobun/package/src/native/shared/chromium_flags.h`
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/{bundling-and-distribution,code-signing}.mdx`
- `.cache/electrobun/docs/src/content/docs/electrobun/apis/{build-config,bundled-assets,bundling-cef}.mdx`
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-18-0.mdx`
- `.cache/electrobun/kitchen/electrobun.config.ts`
