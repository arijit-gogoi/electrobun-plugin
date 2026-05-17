# SPEC

## §G GOAL

Claude Code plugin `electrobun-plugin`. Skill + 9 sub-skills. Scaffold, debug, reason about Electrobun apps. Model-first, source-grounded. Distributed via `ari-marketplace`.

## §C CONSTRAINTS

- Plugin name: `electrobun-plugin`. Skill dir: `skills/electrobun/`. Invoke: `/electrobun`.
- Track upstream `blackboardsh/electrobun` main branch. Pin via SHA in `refs/`.
- Upstream clone gitignored. `.cache/electrobun/`. Build-time reference only. Not redistributed.
- Skill ships only `SKILL.md` + sub-skills + curated `refs/` snapshots. User installs electrobun via `bun add electrobun` in own project.
- Sources hierarchy: local clone = authoritative ∴ source code wins, deepwiki = fast structural overview, context7 = quick API lookup.
- Skill ! direct Claude to live-query deepwiki+context7 when `refs/` insufficient.
- Electron correspondence inline per sub-skill ("Electron analog: X"). ⊥ separate map file.
- Bootstrap scripts: `.ps1` + `.sh`. Flags: `--refresh` (git pull), `--force` (nuke+reclone), no flag = clone-if-missing.
- Recon archives go to `specs/recon-electrobun-<sha>.md`.
- Cavekit: `SPEC.md` at electrobun-plugin root. Larger architectural notes → `specs/`.

## §I INTERFACES

- cmd: `/electrobun` → main skill activates; dispatch sub-skill | answer Q
- cmd: `/electrobun <topic>` → optional topic hint for dispatch
- file: `.claude-plugin/plugin.json` → name=`electrobun-plugin`, version, skill registration
- file: `skills/electrobun/SKILL.md` → main entry, dispatcher + general Q&A
- dir: `skills/electrobun/sub-skills/{scaffold,views,ipc-rpc,build-dist,updater,webgpu,system-integration,architecture,zig-main}/SKILL.md` → 9 sub-skills
- dir: `skills/electrobun/refs/` → cached deepwiki/context7 snapshots + curated source excerpts
- file: `scripts/bootstrap.ps1` & `scripts/bootstrap.sh` → idempotent clone of upstream
- file: `scripts/refresh-refs.ts` → regen `refs/` snapshots from upstream
- ext: deepwiki MCP `mcp__deepwiki__{read_wiki_structure,read_wiki_contents,ask_question}` repo `blackboardsh/electrobun`
- ext: context7 MCP `/blackboardsh/electrobun` (1104 snippets)
- ext: ari-marketplace `marketplace.json` registers `electrobun-plugin@<tag>`

## §V INVARIANTS

V1: SKILL.md ! state Electron analog inline ∀ concept ∈ {BrowserWindow, BrowserView, IPC, Tray, Updater, preload}
V2: ∀ sub-skill → own `SKILL.md` + own triggers + own electron-correspondence tag
V3: refs/ files ! cite upstream SHA + file:line where derived
V4: bootstrap script ! idempotent. Re-run = same result. ⊥ side effects on second run.
V5: ⊥ commit `.cache/`, `graphify-out/`, `node_modules/`, `dist/`
V6: SKILL.md ! direct Claude to live-query deepwiki/context7 if `refs/` insufficient — explicit fallback chain
V7: bootstrap `--refresh` = `git pull --ff-only`. ⊥ rebase, ⊥ force.
V8: bootstrap `--force` = remove + reclone shallow. ! confirm via prompt? no — explicit flag = consent.
V9: plugin.json `name` = `electrobun-plugin`. Skill dir name = `electrobun`. ⊥ mismatch.
V10: ∀ sub-skill ! map to ≥ 1 source path in `.cache/electrobun/` (provable grounding)
V11: refs/ snapshots ! refreshed before tagging new plugin version. Stale snapshot ⊥ ship.
V12: SemVer per project CLAUDE.md: 0.x.Y patch, 0.X.0 minor (new sub-skill | rename), 1.0.0 = stable surface.
V13: cavekit caveman encoding ∀ SPEC.md & spec-adjacent writes. Code blocks unchanged.
V14: ⊥ redistribute electrobun source. Plugin tarball ! exclude `.cache/`.

## §T TASKS

id|status|task|cites
T1|x|init repo + .gitignore + dir skeleton|V5,V9
T2|x|write bootstrap.ps1 + bootstrap.sh|V4,V7,V8
T3|x|clone upstream electrobun @ 9e421ff|V3
T4|x|recon: deepwiki + context7 + local glob + graphify|V3,V10
T5|x|archive recon to specs/recon-electrobun-9e421ff.md|V3
T6|x|write .claude-plugin/plugin.json|V9,V12
T7|x|write CLAUDE.md (repo-level, model-first, bun, track main)|-
T8|x|design main SKILL.md (dispatcher + Q&A fallback chain)|V1,V6
T9|x|write skills/electrobun/SKILL.md|V1,V2,V6
T10|x|write sub-skill: scaffold (templates, init, electrobun.config.ts)|V1,V2,V10
T11|x|write sub-skill: views (BrowserWindow, BrowserView, navigation, devtools)|V1,V2,V10
T12|x|write sub-skill: ipc-rpc (Electroview.defineRPC, preload bridges)|V1,V2,V10
T13|x|write sub-skill: build-dist (build.ts, bundleCEF, codesign, notarize)|V1,V2,V10
T14|x|write sub-skill: updater (BSDIFF, channels, naming.ts discipline)|V1,V2,V10
T15|x|write sub-skill: webgpu (GpuWindow, WGPUView, Dawn adapter, three/babylon)|V1,V2,V10
T16|x|write sub-skill: system-integration (Tray, menus, shortcuts, clipboard, dialogs)|V1,V2,V10
T17|x|write sub-skill: architecture (3-layer, FFI, self-extractor, launcher)|V1,V2,V10
T18|x|write sub-skill: zig-main (mainProcess:"zig", zig-sdk/electrobun.zig)|V1,V2,V10
T19|x|seed refs/deepwiki-overview.md from snapshot|V3,V11
T20|x|seed refs/context7-cheatsheet.md from query-docs result|V3,V11
T21|x|seed refs/examples/ with curated patterns from kitchen playgrounds|V3,V10,V11
T22|x|write scripts/refresh-refs.ts (regen snapshots, bump SHA)|V11
T23|x|verify checklist: V1 .. V14 ∀ pass|all
T24|.|tag v0.1.0 + register in ari-marketplace/marketplace.json|V11,V12

## §B BUGS

id|date|cause|fix
