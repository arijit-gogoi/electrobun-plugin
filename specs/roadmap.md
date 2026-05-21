# Roadmap — electrobun-plugin

Tentative. Subject to learning during v0.2 build.

Items below were explicitly deferred during v0.2.0 planning. Each row records:
- **Item** — what got cut
- **Cut from** — version where it was scoped out
- **Reason** — why deferred (scope, risk, blocked-on-something)
- **Likely target** — best-guess version when it lands. Tentative.
- **Blockers** — what has to happen first
- **Notes** — design hints captured at cut-time so the next pass doesn't re-design from zero

---

## v0.3 candidates (next minor after v0.2 stabilises)

### Native log tail — macOS

- **Item:** `electrobun_native_log` tool for macOS (Console.app source).
- **Cut from:** v0.2.0 (Windows-first only).
- **Reason:** developer hardware = Windows; macOS implementation untestable from this dev box.
- **Likely target:** v0.3.0.
- **Blockers:** macOS dev access for testing OR willing macOS contributor.
- **Notes:** `log stream --predicate 'subsystem == "<app-bundle-id>"' --info` is the canonical command. Use `Bun.spawn` to tail and stream lines. Parse `<timestamp> <subsystem>: <message>` shape.

### Native log tail — Linux

- **Item:** `electrobun_native_log` tool for Linux.
- **Cut from:** v0.2.0.
- **Reason:** same as macOS — untestable from Windows dev box.
- **Likely target:** v0.3.0 (alongside macOS).
- **Blockers:** Linux dev access OR contributor.
- **Notes:** `journalctl --user-unit=<unit-name> -f` if systemd, else `tail -f /var/log/syslog` filtered by app name. Detect DE / init system at tool entry.

### CDP MCP for system webview — macOS WebKit / WebView2 (Win) / WebKit2GTK (Linux)

- **Item:** Tier 1 CDP tools work when `bundleCEF: false`.
- **Cut from:** v0.2.0 (CEF-only).
- **Reason:** each system webview has its own debug protocol — three adapters in v0.2 was scope creep.
- **Likely target:** v0.3.x partial (WebView2 first since CDP-ish), v0.4 full.
- **Blockers:** WebView2 → CDP-mode docs (Windows). WebKit Inspector Protocol bindings (mac + Linux).
- **Notes:**
  - **WebView2** supports CDP via `ICoreWebView2_15.CallDevToolsProtocolMethod` — adapter is mostly wire-format translation.
  - **WebKit (mac, Linux GTK)** uses Web Inspector Protocol. Different shape from CDP. Need a translation layer or expose both as separate tool groups.
- **Risk:** electrobun upstream may change which protocol it exposes; coordinate before building.

---

## v0.4+ candidates

### Production-build instrumentation

- **Item:** Tier 2 devtools (read-only subset) usable against signed `bun build:release` artifacts.
- **Cut from:** v0.2.0.
- **Reason:** Three blockers — (a) auth flow in a notarized GUI app (no terminal to paste token), (b) `eval_js` in prod = arbitrary code exec in shipped product, (c) code-signing breaks if devtools lib is bundled at build time.
- **Likely target:** v0.4.0.
- **Blockers:** Design pass on prod-safe surface. Probably: drop eval, log-only, gated by a build-time `--include-devtools-readonly` flag.
- **Notes:**
  - One model: `electrobun-devtools-prod` separate npm pkg with strictly read-only surface.
  - Auth via signed token baked at build time, never user-pasted in prod.
  - Bundle adds ~50KB to prod build → acceptable if opt-in.
  - Documented warning: "enabling prod devtools exposes app state to localhost; do not ship to end users".

### Upstream electrobun: expose `ffi` and `BrowserWindowMap` via `exports` field

- **Item:** electrobun's `package.json` `exports` field only exposes `"."`, `"./bun"`, `"./view"`. Anything deeper (`./dist/api/bun/proc/native`, `./dist/api/bun/core/BrowserWindow`) is unreachable from user code. This blocks `electrobun_ffi_log` for bundled apps in v0.2.x — devtools can't monkey-patch what it can't import.
- **Cut from:** v0.2.x (the only fix is upstream).
- **Likely target:** v0.3.0 (after upstream PR or workaround).
- **Blockers:**
  - Submit PR to `blackboardsh/electrobun` adding `"./internal/*": "./dist/*"` or similar to `exports`.
  - OR find a different runtime mechanism: have `electrobun-devtools` patch electrobun BEFORE bundling. Tricky.
  - OR have electrobun publish a `getInternals()` debug API that returns `{ ffi, BrowserWindowMap, ...}` — Yoav-cooperative.
- **Discovered:** 2026-05-18 during full-validation E2E. 15/16 tools pass; ffi_log only fail.
- **Workaround in v0.2.x:** `electrobun_ffi_log` returns 0 entries silently with a warning at devtools.start.

### `bun_eval` in Tier 2 with stronger gate

- **Item:** Currently double-gated (token + `allowEval: true`). Want triple gate: per-call user confirmation in Claude Code UI.
- **Cut from:** v0.2.0 (will ship with `allowEval` default-off; per-call confirm deferred).
- **Likely target:** v0.3.0.
- **Blockers:** Need MCP / Claude Code surface for per-call user prompts. May already exist; investigate.
- **Notes:** Currently `bun_eval` either works (allowEval=true) or refuses (allowEval=false). v0.3: even if allowEval=true, each call shows the user "Allow Claude to run this code in your main process? [code preview]". Maps to Claude Code's existing tool-permission flow.

### Optional token gate for multi-user dev boxes

- **Item:** `devtools.start({ requireToken: true })` server flag. When set, WS server demands token in client handshake.
- **Cut from:** v0.2.4 (token removed entirely, see B3 + V28). v0.2.0-v0.2.3 had default-on token; UX cost > security value on single-user dev boxes.
- **Reason:** Multi-user dev boxes (shared workstations, jump hosts) need real auth. Reintroduce as opt-in, not default.
- **Likely target:** v0.4.0+.
- **Blockers:** UX — token must auto-read from file or env-var, NOT a userConfig paste field (that was B3).
- **Notes:** Default off. Opt-in via flag.

### Multi-instance MCP (drive multiple electrobun apps simultaneously)

- **Item:** Single MCP server connects to N running electrobun apps.
- **Cut from:** v0.2.0 (single-process locked at design).
- **Likely target:** v0.4.0+.
- **Blockers:** Multiplexing design — addressing scheme, per-app auth, tool-call routing.
- **Notes:** Each electrobun app exposes a distinct port (default 9876 + offset). User pastes tokens for each. MCP tool args grow `appId` field. Doable but doubles UX complexity.

### CDP-only mode (no Tier 2)

- **Item:** Plugin works for users who only have CEF + can't or won't install `electrobun-devtools`.
- **Status:** Already supported in v0.2 (Tier 2 tools just error if devtools-port unreachable). Listed here as a graceful-degradation tracking item — confirm UX is friendly when only Tier 1 backend is reachable.

### Upstream-merge `electrobun-devtools` into core electrobun

- **Item:** Talk to `@YoavCodes`. If accepted, `electrobun-devtools` becomes part of upstream as `@electrobun/devtools` (or similar). Plugin keeps shipping the MCP-server side; devtools-lib side moves out.
- **Cut from:** v0.2.0 (don't bet on upstream merge timing).
- **Likely target:** v1.0.0 (or never).
- **Blockers:** Upstream willingness + design alignment.
- **Notes:** Pros — discoverability, one npm pkg, official. Cons — release coupling, slower iteration, design committee.

---

## v1.0+ candidates

### Stable MCP tool surface

- **Item:** Lock the 16 tool names + arg schemas. SemVer becomes meaningful.
- **Cut from:** v0.2-v0.4 (we expect breaking changes during the early life).
- **Likely target:** v1.0.0.
- **Notes:** Sub-skill SKILL.md files mention "API may shift between minor versions until v1.0".

### Plugin marketplace categorisation

- **Item:** When ari-marketplace grows beyond `development`, slot `electrobun` more precisely (e.g. `desktop-frameworks`, `dev-tools-mcp`).
- **Cut from:** v0.2.
- **Notes:** No-op until ari-marketplace supports sub-categories.

### Skill-side improvements unrelated to MCP

- Caveat: this roadmap deliberately separates MCP-related deferrals from skill-content deferrals. Skill drift items below are nice-to-haves.

- **Skill: testing sub-skill.** Currently absent. Test framework usage, `kitchen/src/test-framework/`, automated vs interactive tests. Likely v0.3.0.
- **Skill: deep-link / file-association sub-skill.** Currently inside `system-integration`. May warrant its own when v1.18+ matures.
- **Skill: full ecosystem map** of community apps (the README list in upstream). Currently absent. Could become a `showcases/` sub-skill or a generated table.
- **Skill: native-build sub-skill** for people forking electrobun core. Niche. Probably never first-class.

---

## Stretch / unlikely

### Hot-reload over MCP

- **Item:** "Claude, change my mainview/index.ts to add a button" → MCP tool patches file + triggers electrobun-dev's hot-reload.
- **Notes:** Probably better solved via Claude's existing Edit tool + electrobun's file watcher. Listed for completeness.

### Replay / time-travel

- **Item:** Record RPC + FFI traffic; replay against captured snapshot.
- **Notes:** Hard. Defer indefinitely.

### Claude-as-tray (autonomous Claude listening to user app events)

- **Item:** MCP + Claude Code channels (`channels` plugin feature) → Claude reacts to app events while user is away. "Notify me on Slack when the build server reports a webview crash."
- **Notes:** Speculative. Listed because the plugin format technically supports it (`channels` key in plugin.json).

---

## Decision log (what got chosen, why)

This section is the "why we picked X" trail. Useful when deferred items come up again later.

| Date | Choice | Rejected alts | Reason |
|---|---|---|---|
| 2026-05-18 | Monorepo (plugin + npm slice) | Two separate repos | One-stop maintenance, shared protocol-version constant, atomic releases. |
| 2026-05-18 | stdio MCP transport | WS / HTTP | Canonical for Claude Code. Less surface area, less moving parts. |
| 2026-05-18 | TS source publish for `electrobun-devtools` | Bundled ESM | Electrobun apps already TS-native; Bun resolves cleanly; no minification opacity. |
| 2026-05-18 | Persistent token file `.electrobun-devtools-token` | Regen-per-session token | Friction reduction. User pastes once per project. Regen via `--force-token`. |
| 2026-05-18 | Strict version-lock plugin↔devtools | Protocol version negotiation | Simpler. Plugin == devtools major.minor or refuse. Bump together. |
| 2026-05-18 | CEF-only Tier 1 | All-webview Tier 1 | System-webview = 3 separate protocols (CDP+ish, WebKit Inspector). v0.2 scope dies. |
| 2026-05-18 | Windows-first native_log | All 3 platforms | Dev box is Windows; mac/linux untestable. |
| 2026-05-18 | Drop prod instrumentation v0.2 | Read-only prod mode | Auth flow + code-sign issues need a real design pass. |
| 2026-05-18 | `bun_eval` gate = token + allowEval | Token only | Code-exec in main process = high blast radius. Default-off opt-in. |
| 2026-05-18 | 3 ugly tags during v0.2 build | Many alpha tags / single big tag | "Exactly 3 commits" — meaningful chunks at deployable boundaries. |
| 2026-05-18 | Graphify own-code separately | Single combined graph | Plugin-internal architecture drift signal independent from upstream snapshot. |
