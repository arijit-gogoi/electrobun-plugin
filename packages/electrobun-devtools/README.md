# electrobun-devtools

Dev-mode instrumentation library for [Electrobun](https://github.com/blackboardsh/electrobun) apps. Companion to the [electrobun-plugin](https://github.com/arijit-gogoi/electrobun-plugin) Claude Code plugin — exposes your running app's state to the plugin's MCP server so Claude can read RPC traffic, watch FFI calls, eval in main process, inspect the updater, tail native logs, and more.

> **Dev only.** Refuses to start when `NODE_ENV === "production"`. Do not ship in your production build.

## Install

```bash
bun add -d electrobun-devtools
```

## Use

```ts
// src/bun/index.ts
import { BrowserWindow } from "electrobun/bun";
import { devtools } from "electrobun-devtools";

if (process.env.NODE_ENV !== "production") {
  await devtools.start({ port: 9876 });
}

new BrowserWindow({ url: "views://mainview/index.html" });
```

On first run, `devtools.start()`:

1. Generates a session token, prints it to stdout: `[electrobun-devtools] token: xyz123...`
2. Writes the token to `.electrobun-devtools-token` in your project dir (gitignored).
3. Listens on `localhost:9876` for the MCP server to connect.

You paste the token into Claude Code once (see plugin instructions). Reuse across sessions.

To rotate the token: delete the file, OR call `devtools.start({ forceToken: true })`.

## What the plugin gets access to

Once connected, the [electrobun-plugin](https://github.com/arijit-gogoi/electrobun-plugin) MCP exposes tools to Claude:

- `electrobun_list_windows()` — enumerate `BrowserWindow` instances.
- `electrobun_rpc_log()` — recent bun↔webview RPC traffic.
- `electrobun_ffi_log()` — recent native FFI calls.
- `electrobun_bun_eval(code)` — evaluate in the main process. **Gated.** Requires `allowEval: true` in plugin user-config; off by default.
- `electrobun_updater_state()` — current `Updater` state.
- `electrobun_app_log()` — recent bun process console output.
- `electrobun_native_log()` — platform-native log tail. Currently **Windows-only** in this version.

## Security model

- All tools require auth via the session token. No token in WS handshake = connection refused.
- `bun_eval` requires plugin user-config `allowEval: true` opt-in. Default is off.
- Token file `.electrobun-devtools-token` is gitignored. Do not commit.
- Listens on `localhost` only. Not reachable from network.
- Refuses to start in production.

## Version coupling

`electrobun-devtools` is version-locked with `electrobun-plugin`. Major.minor must match. If they don't, the plugin refuses to connect and prints an upgrade message. Bump both together.

## License

MIT.
