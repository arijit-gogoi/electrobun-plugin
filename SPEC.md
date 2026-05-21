# SPEC

## §G GOAL

Claude Code plugin `electrobun-plugin`. Skill + 9 sub-skills + embedded MCP server (Tier 1 CDP, Tier 2 devtools-bridge). Scaffold, debug, reason about, AND drive running Electrobun apps. Model-first, source-grounded. Distributed via `ari-marketplace`. Companion npm pkg `electrobun-devtools` ships from same repo as Tier 2 backend.

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
- Monorepo: bun workspaces. Root = plugin. `packages/electrobun-devtools/` = npm-publishable slice (TS source).
- MCP server: TS in `src/mcp/`. Bundled to `dist/mcp/index.js` (committed). Loaded via `.mcp.json`.
- MCP transport: stdio only. ⊥ websocket | http.
- `electrobun` = devDep root pkg.json. Pin = SHA of `.cache/electrobun/`. Bump together.
- Tier 1 (CDP): CEF-only v0.2. system-webview (`bundleCEF: false`) deferred → roadmap.
- Tier 2 (bridge): WS over localhost. Tier 2 backend = `electrobun-devtools` npm pkg user adds in own app.
- Token = persistent file `.electrobun-devtools-token` in user's app dir. Paste once per project.
- `bun_eval` ! double-gated: token AND `allowEval: true` userConfig opt-in.
- ⊥ prod-mode instrumentation v0.2. Deferred to roadmap.
- Native log tail: Windows-first v0.2. macOS + Linux deferred → roadmap.
- Version bumps: 3 ugly tags during v0.2 build (`v0.2.0-a`, `v0.2.0-b`, `v0.2.0`).
- `electrobun-devtools` strict version-lock: plugin checks pkg version on connect, refuses on mismatch.

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
- file: `.mcp.json` at plugin root → declares stdio MCP server `electrobun`, command=`${CLAUDE_PLUGIN_ROOT}/dist/mcp/index.js`
- cfg: `plugin.json userConfig` → `devSessionToken` (secret), `cdpPort` (default 9222), `devtoolsPort` (default 9876), `allowEval` (default false)
- file: `package.json` (root) → bun workspaces `["packages/*"]`, devDep `electrobun@1.18.4-beta.3`, dep `@modelcontextprotocol/sdk`
- file: `packages/electrobun-devtools/package.json` → npm pkg `electrobun-devtools`, TS source publish, exports `./index.ts`
- api: `import { devtools } from "electrobun-devtools"; await devtools.start({ port: 9876 })` in user's `src/bun/index.ts` (dev only)
- proto: WS message `{ kind: "auth", token: "..." } → { ok: bool }` then `{ kind: "tool-call", name, args, id } → { kind: "tool-result", id, ... }`
- proto: version field on handshake — strict match plugin version major.minor
- tool: 9 CDP tools — list_views, eval, navigate, reload, screenshot, dom, console, network, devtools
- tool: 7 bridge tools — list_windows, rpc_log, ffi_log, bun_eval (gated), updater_state, app_log, native_log (win)
- ext: npm registry `electrobun-devtools` (public, no scope) — confirmed available 2026-05-17
- file: `dist/mcp/index.js` — built artifact, committed (shipped with plugin)
- dir: `graphify-out-self/` (gitignored) — graph of our own repo code, distinct from upstream graphify-out/

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
V15: MCP server transport = stdio. ⊥ websocket | http listener from MCP server.
V16: ~~∀ MCP tool call ! pass session-token auth check before exec.~~ OBSOLETE v0.2.4 — see V28, B3.
V17: `bun_eval` ! gated by `userConfig.allowEval == true`. ⊥ default-on. (Was double-gated, simplified in v0.2.4 with V16 removal.)
V18: `dist/mcp/index.js` committed. Plugin install = users get bundled JS, ⊥ rebuild required.
V19: `electrobun-devtools` published to npm as standalone slice from `packages/electrobun-devtools/`. Plugin & pkg version locked strict (major.minor).
V20: ⊥ prod-mode instrumentation v0.2. Devtools lib ! check `process.env.NODE_ENV !== "production"` & refuse start in prod.
V21: Tier 1 CDP ! work with `bundleCEF: true` & `chromiumFlags["remote-debugging-port"]` set. System-webview support deferred.
V22: graphify own-code → `graphify-out-self/` before tagging v0.2.0 final. Tracks plugin-internal architecture drift.
V23: ~~Token = persistent file `.electrobun-devtools-token`...~~ OBSOLETE v0.2.4 — see V28, B3.
V24: `electrobun-devtools` ships TS source, no bundling. User's bun resolves at install time.
V25: Native log tail v0.2 = Windows only. macOS + Linux → roadmap.
V26: ∀ event-buffer CDP tool (console, network) → first call subscribes lazily ∴ caller ! invoke once before triggering events. Document in tool description.
V27: `bun run verify` ! pass before any tag push. Chain = `claude plugin validate` → `tsc --noEmit` → `build:mcp`. Manifest validate first ∵ B2 (v0.2.2 shipped invalid `userConfig`, install ⊥ on users). Cheap gate, prevents stale `dist/`.
V28: ⊥ token auth. devtools WS server binds 127.0.0.1 only ∴ OS firewall = network perimeter. `bun_eval` gated by `allowEval=true` opt-in alone ∵ B3 — paste-token UX cost > local-process threat model for single-user dev box. Multi-user dev box scenario → roadmap (v0.4+, reintroduce as opt-in `requireToken: true` server flag).

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
T24|x|tag v0.1.0 + register in ari-marketplace/marketplace.json|V11,V12
T25|x|write specs/roadmap.md (deferred: prod, sysWebview, mac/linux native_log, etc.)|-
T26|x|write root package.json (bun workspaces, deps)|V19,C(monorepo)
T27|x|write tsconfig.json (root) + tsconfig.mcp.json|-
T28|x|write packages/electrobun-devtools/package.json + tsconfig + skeleton|V19,V24
T29|x|mkdir src/mcp/{tools/cdp,tools/bridge,transport}, src/mcp/index.ts skeleton|V15,V16
T30|x|amend .claude-plugin/plugin.json with userConfig fields|I(userConfig)
T31|x|write .mcp.json (stdio, ${CLAUDE_PLUGIN_ROOT}/dist/mcp/index.js)|V15,V18
T32|x|amend .gitignore (dist/ removed since committed, add graphify-out-self/, .electrobun-devtools-token)|V18,V22
T33|x|verify v0.2.0-a structure pass + commit + tag v0.2.0-a|V15,V16,V17,V18,V19
T34|x|write src/mcp/auth.ts (token check from userConfig env var)|V16
T35|x|write src/mcp/transport/cdp-client.ts (WS to localhost:cdpPort)|V21
T36|x|write src/mcp/tools/cdp/list_views.ts (CDP Target.getTargets)|V16,V21
T37|x|write src/mcp/tools/cdp/eval.ts (CDP Runtime.evaluate)|V16,V21
T38|x|write src/mcp/tools/cdp/navigate.ts (CDP Page.navigate)|V16,V21
T39|x|write src/mcp/tools/cdp/reload.ts (CDP Page.reload)|V16,V21
T40|x|write src/mcp/tools/cdp/screenshot.ts (CDP Page.captureScreenshot, return PNG)|V16,V21
T41|x|write src/mcp/tools/cdp/dom.ts (CDP DOM.getDocument + DOM.outerHTML)|V16,V21
T42|x|write src/mcp/tools/cdp/console.ts (CDP Console.messageAdded buffer)|V16,V21
T43|x|write src/mcp/tools/cdp/network.ts (CDP Network.* events buffer)|V16,V21
T44|x|write src/mcp/tools/cdp/devtools.ts (open native devtools — CDP or fallback)|V16,V21
T45|x|write src/mcp/index.ts (MCP server, stdio, register tools, mount auth)|V15,V16
T46|x|write scripts/build-mcp.ts (bun build → dist/mcp/index.js)|V18
T47|x|run build, commit dist/mcp/index.js, verify .mcp.json wiring|V18
T48|x|verify v0.2.0-b: 9 CDP tools functional + commit + tag v0.2.0-b|V15-V21
T49|x|write packages/electrobun-devtools/src/server.ts (WS listen, token gen, persistent file)|V16,V19,V23,V24
T50|x|write packages/electrobun-devtools/src/index.ts (devtools.start/stop API)|V19,V24
T51|x|write packages/electrobun-devtools/src/hooks/rpc.ts (monkey-patch shared/rpc.ts)|V19,V24
T52|x|write packages/electrobun-devtools/src/hooks/ffi.ts (monkey-patch bun/proc/native.ts)|V19,V24
T53|x|write packages/electrobun-devtools/src/hooks/windows.ts (observe BrowserWindow lifecycle)|V19,V24
T54|x|write packages/electrobun-devtools/src/log-tail/windows.ts (Get-WinEvent filtered)|V19,V25
T55|x|write packages/electrobun-devtools/src/protocol.ts (version-locked handshake, message shapes)|V19
T56|x|write src/mcp/transport/devtools-client.ts (WS client to electrobun-devtools)|V16
T57|x|write src/mcp/tools/bridge/list_windows.ts|V16
T58|x|write src/mcp/tools/bridge/rpc_log.ts|V16
T59|x|write src/mcp/tools/bridge/ffi_log.ts|V16
T60|x|write src/mcp/tools/bridge/bun_eval.ts (double-gated)|V16,V17
T61|x|write src/mcp/tools/bridge/updater_state.ts|V16
T62|x|write src/mcp/tools/bridge/app_log.ts (bun process console buffer)|V16
T63|x|write src/mcp/tools/bridge/native_log.ts (Windows-first)|V16,V25
T64|x|rebuild dist/mcp/index.js with bridge tools|V18
T65|x|graphify own-code → graphify-out-self/|V22
T66|x|verify V15-V25 ∀ pass + commit|V15-V25
T67|x|publish electrobun-devtools to npm (public, no scope)|V19
T68|x|tag v0.2.0 final + push|V11,V12
T69|x|bump ari-marketplace electrobun → v0.2.0 + push|V11,V12

## §B BUGS

id|date|cause|fix
B1|2026-05-18|`electrobun_network` lazy-subscribes on first call ∴ events fired before first call lost. E2E test caught it (0 entries when fetch happened pre-subscribe). Same shape applies to `electrobun_console`.|V26 added — tool descriptions ! note subscription semantics. Test rewritten: warm tool before triggering event.
B2|2026-05-19|Plugin install on user machine ⊥ — manifest validation errors: `userConfig.*.title` missing (required), `secret: true` unrecognized (should be `sensitive`). Schema came from outdated draft; current docs at code.claude.com require `title` + `sensitive`.|v0.2.3: add `title` to all 4 userConfig fields, rename `secret`→`sensitive`. Also wire `${user_config.KEY}` → env block in .mcp.json so token actually flows. `claude plugin validate` now passes.
B3|2026-05-19|Token UX fail — user pasted token + ran `/reload-plugins`, MCP server still saw empty token. Even when fixed, paste-once-per-project = friction. Single-user dev box on 127.0.0.1 means token's threat model (other local processes) << UX cost. V16 was over-engineered.|v0.2.4: drop token entirely. Manifest field gone, AuthConfig.devSessionToken gone, requireToken() deleted, server skips token check. Plugin↔devtools handshake still version-locks. V16 obsoleted, replaced with V28 (rationale).
