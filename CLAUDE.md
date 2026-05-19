# electrobun-plugin

Claude Code plugin: complete Electrobun skill (9 sub-skills) + embedded MCP server (16 tools).
Distributed via `ari-marketplace`. Tracks upstream `blackboardsh/electrobun` main.
Companion npm pkg `electrobun-devtools` published from `packages/electrobun-devtools/`.

## Layout

```
.claude-plugin/plugin.json         # plugin manifest (incl. userConfig for MCP)
.mcp.json                          # stdio MCP server declaration
SPEC.md                            # cavekit spec — single source of truth
package.json                       # bun workspaces, devDep electrobun, dep MCP SDK
tsconfig.json
specs/
  recon-electrobun-<sha>.md        # archived recon passes
  roadmap.md                       # deferred work
skills/electrobun/
  SKILL.md                         # main entry + dispatcher + general Q&A
  refs/                            # cached deepwiki/context7 snapshots + examples
  sub-skills/{scaffold,views,ipc-rpc,build-dist,updater,
              webgpu,system-integration,architecture,zig-main}/SKILL.md
src/mcp/
  index.ts                         # stdio MCP server entry, tool dispatch
  auth.ts                          # token + allowEval gates
  transport/
    cdp-client.ts                  # WS to CDP localhost:cdpPort
    devtools-client.ts             # WS to electrobun-devtools localhost:devtoolsPort
  tools/
    cdp/{list_views,eval,navigate,reload,screenshot,
         dom,console,network,devtools}.ts        # 9 Tier 1 tools
    bridge/{list_windows,rpc_log,ffi_log,bun_eval,
            updater_state,app_log,native_log}.ts # 7 Tier 2 tools
dist/mcp/
  index.js                         # built MCP artifact — COMMITTED (V18)
packages/electrobun-devtools/
  package.json                     # npm pkg "electrobun-devtools"
  src/{index,server,protocol}.ts
  src/hooks/{rpc,ffi,windows}.ts   # monkey-patches into electrobun
  src/log-tail/windows.ts          # Windows-first native log tail
  README.md
scripts/
  bootstrap.{ps1,sh}               # clone upstream into .cache/
  refresh-refs.ts                  # bump SHA in refs/ frontmatter
  build-mcp.ts                     # bundle src/mcp → dist/mcp/index.js
.cache/electrobun/                 # gitignored upstream clone
graphify-out/                      # gitignored upstream graph
graphify-out-self/                 # gitignored own-code graph (V22)
```

## Principles

- **Model-first.** SKILL.md content prioritises what Claude (the model) needs to answer with high confidence. Ground every claim in upstream source.
- **Source-grounded.** `refs/` snapshots cite upstream SHA + `file:line`. If a claim isn't traceable, drop it.
- **No redistribution.** `.cache/electrobun/` is build-time reference only. Plugin tarball ships SKILL.md + sub-skills + curated `refs/` snapshots — not the upstream source.
- **Live fallback.** When `refs/` is insufficient, SKILL.md instructs Claude to live-query `deepwiki` (overview) and `context7` (API snippets).
- **Electron correspondence inline.** Every public concept (BrowserWindow, BrowserView, IPC, Tray, Updater, preload) names its Electron analog in the sub-skill that owns it. No separate map file.
- **Bun toolchain.** Scripts run under Bun (`bun run scripts/refresh-refs.ts`). Examples target Node ≥ 24 and `electrobun` from npm (currently `1.18.4-beta.3`).

## Working on this plugin

1. `bun install` — resolves workspace deps (electrobun devDep, MCP SDK, etc.).
2. `./scripts/bootstrap.sh` (or `.ps1`) — clones `blackboardsh/electrobun` → `.cache/electrobun/`. Idempotent.
3. Edit SKILL.md / sub-skills / `src/mcp/`. Verify claims against `.cache/electrobun/<path>`.
4. If MCP code changed: `bun run build:mcp` → updates `dist/mcp/index.js`. Commit the rebuilt artifact (V18).
5. If refs/ changed: `bun run refresh-refs` before tagging.
6. If `packages/electrobun-devtools/` changed: bump its `package.json` `version` to match plugin (V19 strict lock).
7. Commit, `git tag -a vX.Y.Z`, push tag.
8. If devtools pkg changed: `cd packages/electrobun-devtools && npm publish --access public`.
9. Bump entry in `ari-marketplace/.claude-plugin/marketplace.json`. Push.

## Build / test

```bash
bun install                    # workspace install
bun run verify                 # MUST pass before tagging — see below
bun dist/mcp/index.js          # smoke-test MCP — should print "ready (16 tools)"
```

`bun run verify` chains three steps (fail-fast):
1. `claude plugin validate` — manifest schema (catches B2-class install failures)
2. `bun tsc --noEmit`        — type-check src/mcp + packages/electrobun-devtools
3. `bun run build:mcp`       — bundles dist/mcp/index.js (committed per V18)

`claude` CLI must be on PATH. Step 1 is non-negotiable: schema drift means users can't install.

## SemVer policy

- `0.x.Y` patch — fix only, no public skill/MCP surface change. Plugin + devtools pkg bump together.
- `0.X.0` minor — new sub-skill, new MCP tool, rename, refs refresh that changes guidance.
- `1.0.0` — first time the SKILL.md + sub-skill list + MCP tool surface considered stable.
- Plugin version ↔ `electrobun-devtools` pkg version: strict major.minor lock. Bump in lockstep.

## Upstream tracking

- HEAD pinned in `refs/deepwiki-overview.md` frontmatter (SHA + date).
- `scripts/refresh-refs.ts` updates SHA + regenerates snapshots.
- Bump SHA on every plugin minor/patch that ships refreshed refs.

## Source hierarchy (for Claude)

1. **Local clone (`.cache/electrobun/`)** — authoritative. Source code wins ties.
2. **deepwiki** — fast structural overview; AI-summarised, may lag main.
3. **context7** (`/blackboardsh/electrobun`) — quick API lookups, 1104+ snippets.
4. **`refs/` snapshots** — curated, pre-cached. Cheap. May be stale between releases.

When `refs/` insufficient or user asks something current, jump to live deepwiki or context7. State the source.

## Recon archives

`specs/recon-electrobun-<sha>.md` — one per recon pass. Captures god nodes, community map, sub-skill mapping for that snapshot. Useful when designing new sub-skills or auditing drift.

## MCP server

The plugin embeds a stdio MCP server. Two tool tiers:

- **Tier 1 (CDP)** — `electrobun_{list_views, eval, navigate, reload, screenshot, dom, console, network, devtools}`. Needs `bundleCEF: true` + `chromiumFlags['remote-debugging-port']` in user's `electrobun.config.ts`.
- **Tier 2 (bridge)** — `electrobun_{list_windows, rpc_log, ffi_log, bun_eval, updater_state, app_log, native_log}`. Needs `electrobun-devtools` npm pkg in user's app + `devtools.start({ port })` call in dev.

User-side setup (target app):

```bash
bun add -d electrobun-devtools
```

```ts
// src/bun/index.ts
import { devtools } from "electrobun-devtools";
if (process.env.NODE_ENV !== "production") {
  await devtools.start({ port: 9876 });
}
```

```ts
// electrobun.config.ts — for Tier 1 CDP
build: {
  mac:   { bundleCEF: true, chromiumFlags: { "remote-debugging-port": "9222" } },
  linux: { bundleCEF: true, chromiumFlags: { "remote-debugging-port": "9222" } },
  win:   { bundleCEF: true, chromiumFlags: { "remote-debugging-port": "9222" } },
}
```

Token: `electrobun-devtools` prints it once + saves to `.electrobun-devtools-token` in app dir. User pastes into plugin user-config (`/plugin`) once per project. `bun_eval` additionally requires `allowEval: true` opt-in (V17).

## Don't

- Don't commit `.cache/`, `graphify-out/`, `graphify-out-self/`, `node_modules/`, `bun.lockb`. Do commit `dist/mcp/index.js` (V18) and `packages/electrobun-devtools/src/**` (V24).
- Don't redistribute upstream electrobun source.
- Don't paraphrase electrobun docs without citing `file:line`.
- Don't write prose where caveman fits (workspace convention — Ari uses /caveman mode).
- Don't add MCP tools without a `requireToken(cfg)` call (V16).
- Don't add code-exec tools without double-gating via `requireEvalAllowed(cfg)` (V17).
- Don't bump plugin without bumping `electrobun-devtools` to matching major.minor (V19).
