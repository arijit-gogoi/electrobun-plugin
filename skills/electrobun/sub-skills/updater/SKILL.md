---
name: electrobun-updater
description: Auto-updates via BSDIFF patches and ZSTD full-bundle fallback. Covers `Updater.checkForUpdate`, `Updater.downloadUpdate`, `Updater.applyUpdate`, release channels (canary/stable), the `naming.ts` artifact-name discipline, Windows-specific `.bat` script trick due to file locking, `bucketUrl` → `baseUrl` v1.0.0 migration, and the `release.generatePatch` build flag. Use when the user asks about app updates, BSDIFF, release channels, hosting update manifests, or debugging update failures.
---

# Updater — BSDIFF patches + ZSTD fallback

**Electron analogs:**
- `autoUpdater` (electron) → `Updater` (electrobun) — same intent, different transport
- Squirrel / `electron-updater` → built-in, no extra package
- Differential updates via blockmap → BSDIFF patches (zig-optimized)

Key win: typical update is **~4 KB** (a BSDIFF patch). Worst case (cyclic patch chain, missing intermediate) falls back to full ZSTD bundle re-download (~14-150 MB depending on `bundleCEF`).

## Mental model

1. App calls `Updater.checkForUpdate()` → fetches `<baseUrl>/<channel>/<platform>-<arch>/manifest.json`.
2. Compares manifest version to running app version.
3. If newer: tries patch chain (`currentVer → v1 → v2 → ... → latest`) via BSDIFF.
4. If patch chain broken/cyclic: falls back to full bundle ZSTD download.
5. `applyUpdate()` extracts, swaps binaries, schedules restart.

Source: `.cache/electrobun/package/src/bun/core/Updater.ts`. Artifact naming: `.cache/electrobun/package/src/shared/naming.ts`.

## Basic use

```ts
import { Updater } from "electrobun/bun";

// Check once on startup
const update = await Updater.checkForUpdate();

if (update.available) {
  console.log("New version:", update.version);
  await Updater.downloadUpdate();         // streams patches or full bundle
  await Updater.applyUpdate();             // restarts the app
}
```

## Release config in `electrobun.config.ts`

```ts
release: {
  baseUrl: "https://static.example.com/myapp/",   // CDN root
  generatePatch: true,                            // emit BSDIFF patches at build
},
```

**Note:** the field was renamed from `bucketUrl` → `baseUrl` in **v1.0.0**. If you see `bucketUrl` in an old project, migrate. Reason: works with any flat hosting (GitHub Releases, S3, Cloudflare R2), not just buckets. Source: `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-0-0.mdx`.

## What `bun build:release` produces for the updater

Given `release.generatePatch: true` and channel `stable` (default):

```
dist/
└── stable/
    └── darwin-arm64/
        ├── manifest.json                    # latest version + checksums + patch chain
        ├── 1.0.0-darwin-arm64.tar.zst       # full bundle (fallback)
        ├── 1.0.1-darwin-arm64.tar.zst
        ├── 1.0.1-darwin-arm64.from-1.0.0.bsdiff   # delta from 1.0.0 → 1.0.1
        └── ...
```

Upload `dist/<channel>/<platform>-<arch>/*` to whatever your `baseUrl` points to. **Flat structure — no subdirs the host has to render.** Works on GitHub Releases (flat tag assets), S3, R2, any static CDN.

## Channels — canary + stable

```bash
bun build:canary        # → dist/canary/
bun build:stable        # → dist/stable/    (or just `bun build:release`)
```

`Updater.checkForUpdate()` reads the channel the **running app** was built for. To switch a user from canary to stable: tell them to download stable from your site. No in-app channel switch (yet).

Source: channel encoded in artifact name via `naming.ts` — see "naming discipline" below.

## naming.ts discipline (V0 invariant for releases)

Artifact filenames follow a strict pattern handled by `.cache/electrobun/package/src/shared/naming.ts`. The CLI and the Updater MUST use the same helpers — drift here is a release breaker.

```
<version>-<platform>-<arch>[-<channel>].<ext>
1.0.1-darwin-arm64.tar.zst
1.0.1-darwin-arm64-canary.tar.zst
1.0.1-darwin-arm64.from-1.0.0.bsdiff
manifest.json
```

There's a regression test in `.cache/electrobun/package/src/shared/naming.test.ts` that pinned the `-stable` suffix bug (v1.x). If you're forking electrobun or scripting artifact uploads, **use the helpers from `shared/naming.ts`, not handwritten strings**.

## BSDIFF patch chain — how it walks

`downloadUpdate()` reads `manifest.json` which lists every version + every available patch. Algorithm:

1. Start at `currentVersion`.
2. Find a `from-<currentVersion>.bsdiff` → apply, advance current.
3. Repeat until current == latest, OR cycle detected, OR no patch path.
4. On cycle / missing path → download full `<latest>.tar.zst` (ZSTD-decompressed).

Patch application uses zig-cc + libsais (`.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-18-1.mdx` notes a Windows canary path fix here).

## Windows updater trick — the `.bat` script

Windows can't overwrite a running executable. Electrobun's updater:

1. Stages the new binaries in a temp dir.
2. Generates a `.bat` script that waits for the running process to exit, then replaces the binaries.
3. Schedules the script via `schtasks /create /sc once`.
4. Calls `Utils.quit()` to exit gracefully.
5. The `.bat` fires, swaps, restarts the app.

Source: `.cache/electrobun/package/src/bun/core/Updater.ts` (search for `schtasks` / `.bat`). On Mac and Linux, the binary swap is atomic — no script needed.

## `Utils.quit()` — the canonical shutdown

```ts
import { Utils } from "electrobun/bun";

await Utils.quit();         // fires `beforeQuit` event (cancellable), then graceful exit
```

`process.exit` is overridden inside the bun runtime to route through `Utils.quit()`. **Don't use `process.exit` directly** — you'll skip the `beforeQuit` event and risk leaving the updater in an inconsistent state.

## Updating from a user-facing UI

```ts
// bun side
const update = await Updater.checkForUpdate();
if (update.available) {
  // Tell the webview to show an "update available" badge
  win.webview.rpc.send.updateAvailable({ version: update.version });
}

// later, when user clicks "install":
requests: {
  installUpdate: async () => {
    await Updater.downloadUpdate();
    await Updater.applyUpdate();    // restart
    return { ok: true };
  },
}
```

## Local update info

```ts
const info = Updater.localInfo.getLocalInfo();   // v1.18.0+ rename from previous API
// info.version, info.channel, info.platform, info.arch, etc.
```

Older versions used a different name — check the v1.18.0 changelog if your project is older.

## release.baseUrl with auth

If your CDN requires auth (signed URLs, cookies), you'll need to override the fetch in `Updater`. Currently no first-class API for this — pre-sign the manifest URL via your own auth layer, or front the CDN with a proxy that signs. Live-query upstream:

```text
mcp__deepwiki__ask_question repoName="blackboardsh/electrobun" question="How do I customize the fetch used by Updater for authenticated update manifests?"
```

## Common gotchas

1. **`baseUrl` must end with `/`** (flat hosting expects trailing slash). Check `.cache/electrobun/package/src/shared/naming.ts` for the exact path-joining behaviour.
2. **`generatePatch: true` produces patches against the previous build only by default.** If you skip a build (or your CI skipped uploading one), the patch chain breaks → user falls back to full bundle.
3. **macOS notarization required for updates** if the user installed via a notarized binary; mismatched signing identity = updater refuses to swap.
4. **Channel mismatch:** a canary-built app reads canary manifests. Don't ship a canary build to users who expect stable — they'll get canary updates forever.
5. **Don't manipulate the dist tree by hand** — use the CLI. Manual file additions break checksum verification.
6. **Test the updater flow before shipping.** Build N, then N+1 with `release.generatePatch: true`, host both, run N, observe upgrade. Don't trust this end-to-end on first attempt.

## Live recipes

```text
mcp__context7__query-docs   libraryId="/blackboardsh/electrobun" query="Updater checkForUpdate downloadUpdate applyUpdate complete example"
mcp__deepwiki__ask_question repoName="blackboardsh/electrobun" question="What's in manifest.json for the updater? Full schema?"
```

## Cited from

- `.cache/electrobun/package/src/bun/core/Updater.ts` — full updater impl
- `.cache/electrobun/package/src/shared/naming.ts` — artifact name discipline
- `.cache/electrobun/package/src/shared/naming.test.ts` — regression tests
- `.cache/electrobun/package/src/bun/core/Utils.ts` — `quit()` + `process.exit` override
- `.cache/electrobun/docs/src/content/docs/electrobun/apis/updater.mdx`
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/{updates,bundling-and-distribution}.mdx`
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-0-0.mdx` — bucketUrl → baseUrl
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-18-0.mdx` — localInfo rename
- `.cache/electrobun/docs/src/content/docs/electrobun/guides/changelog/v1-18-1.mdx` — Windows canary BSDIFF fix
- `.cache/electrobun/kitchen/src/tests/updater.test.ts` — automated tests
