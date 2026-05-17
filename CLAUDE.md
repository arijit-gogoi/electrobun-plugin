# electrobun-plugin

Claude Code plugin: complete Electrobun skill (scaffold + Q&A + 9 sub-skills).
Distributed via `ari-marketplace`. Tracks upstream `blackboardsh/electrobun` main.

## Layout

```
.claude-plugin/plugin.json         # plugin manifest
SPEC.md                            # cavekit spec (single source of truth)
specs/                             # archived recon + larger architectural notes
skills/electrobun/
  SKILL.md                         # main entry + dispatcher + general Q&A
  refs/                            # cached snapshots (deepwiki, context7, source excerpts)
  sub-skills/{scaffold,views,ipc-rpc,build-dist,updater,
              webgpu,system-integration,architecture,zig-main}/SKILL.md
scripts/
  bootstrap.ps1                    # clone upstream (Windows)
  bootstrap.sh                     # clone upstream (POSIX)
  refresh-refs.ts                  # regenerate refs/ snapshots from upstream
.cache/electrobun/                 # gitignored upstream clone, build-time only
graphify-out/                      # gitignored graph artifacts from recon
```

## Principles

- **Model-first.** SKILL.md content prioritises what Claude (the model) needs to answer with high confidence. Ground every claim in upstream source.
- **Source-grounded.** `refs/` snapshots cite upstream SHA + `file:line`. If a claim isn't traceable, drop it.
- **No redistribution.** `.cache/electrobun/` is build-time reference only. Plugin tarball ships SKILL.md + sub-skills + curated `refs/` snapshots — not the upstream source.
- **Live fallback.** When `refs/` is insufficient, SKILL.md instructs Claude to live-query `deepwiki` (overview) and `context7` (API snippets).
- **Electron correspondence inline.** Every public concept (BrowserWindow, BrowserView, IPC, Tray, Updater, preload) names its Electron analog in the sub-skill that owns it. No separate map file.
- **Bun toolchain.** Scripts run under Bun (`bun run scripts/refresh-refs.ts`). Examples target Node ≥ 24 and `electrobun` from npm (currently `1.18.4-beta.3`).

## Working on this plugin

1. `./scripts/bootstrap.sh` (or `.ps1`) — clones `blackboardsh/electrobun` → `.cache/electrobun/`. Idempotent.
2. Edit SKILL.md / sub-skills. Verify claims against `.cache/electrobun/<path>`.
3. Bump `refs/` snapshots before tagging via `bun run scripts/refresh-refs.ts`.
4. `git tag -a vX.Y.Z -m "..."` then `git push origin main && git push origin vX.Y.Z`.
5. Bump entry in `ari-marketplace/.claude-plugin/marketplace.json` to the new tag.

## SemVer policy (matches workspace CLAUDE.md)

- `0.x.Y` patch — fix only, no public skill surface change
- `0.X.0` minor — new sub-skill, rename, new scaffolder, refs refresh that changes guidance
- `1.0.0` — first time the SKILL.md + sub-skill list is considered stable

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

## Don't

- Don't commit `.cache/`, `graphify-out/`, `node_modules/`, `dist/`.
- Don't redistribute upstream source.
- Don't paraphrase electrobun docs without citing `file:line`.
- Don't write prose where caveman fits (this is the workspace convention — Ari uses /caveman mode).
