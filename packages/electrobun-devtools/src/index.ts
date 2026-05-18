// electrobun-devtools — public API.
// Drop into your electrobun app's src/bun/index.ts to expose runtime state
// to the electrobun-plugin MCP server (Claude Code).
//
// Usage:
//   import { devtools } from "electrobun-devtools";
//   if (process.env.NODE_ENV !== "production") {
//     await devtools.start({ port: 9876 });
//   }

import { startServer, type Server, type ServerOptions } from "./server.ts";
import { installRpcHook, getRpcLog } from "./hooks/rpc.ts";
import { installFfiHook, getFfiLog } from "./hooks/ffi.ts";
import { installWindowHook, getKnownWindows, getUpdaterState, trackWindow } from "./hooks/windows.ts";
import { getNativeLogWindows } from "./log-tail/windows.ts";

const appLog: Array<{ ts: number; level: string; message: string }> = [];
const MAX_APP_LOG = 1000;

function patchConsoleForCapture(): void {
  const original = { ...console };
  const wrap = (level: "log" | "info" | "warn" | "error") => (...args: unknown[]) => {
    appLog.push({
      ts: Date.now(),
      level,
      message: args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
    });
    if (appLog.length > MAX_APP_LOG) appLog.splice(0, appLog.length - MAX_APP_LOG);
    original[level](...args);
  };
  console.log = wrap("log");
  console.info = wrap("info");
  console.warn = wrap("warn");
  console.error = wrap("error");
}

function getAppLog(args: { sinceMs?: number; lastN?: number }): typeof appLog {
  const cutoff = Date.now() - (args.sinceMs ?? 60_000);
  return appLog.filter((e) => e.ts >= cutoff).slice(-(args.lastN ?? 200));
}

export type StartOptions = Omit<ServerOptions, "tools"> & {
  /** Disable specific hooks. */
  hooks?: {
    rpc?: boolean;
    ffi?: boolean;
    windows?: boolean;
    appLog?: boolean;
  };
  /**
   * Provide direct references to electrobun symbols so hooks can monkey-patch
   * the same instances the app already uses. Required for bundled builds where
   * runtime `import("electrobun/...")` can't reach internals.
   *
   * Pass: { BrowserView, BrowserWindow, ffi }
   * where ffi is the proxy object from "electrobun/dist/api/bun/proc/native".
   */
  electrobun?: {
    BrowserView?: { defineRPC?: (cfg: Record<string, unknown>) => unknown };
    BrowserWindow?: unknown;
    BrowserWindowMap?: Record<number, unknown> | Map<unknown, unknown>;
    ffi?: { request?: Record<string, Function>; internal?: Record<string, Function> };
    Updater?: Record<string, unknown>;
  };
};

let serverInstance: Server | null = null;

export async function start(opts: StartOptions = {}): Promise<Server> {
  if (serverInstance) {
    console.warn("[electrobun-devtools] already started — returning existing server");
    return serverInstance;
  }

  const hooks = opts.hooks ?? {};
  const electrobun = opts.electrobun;

  if (hooks.rpc !== false) await installRpcHook(electrobun);
  if (hooks.ffi !== false) await installFfiHook(electrobun);
  if (hooks.windows !== false) await installWindowHook(electrobun);
  if (hooks.appLog !== false) patchConsoleForCapture();

  serverInstance = startServer({
    ...opts,
    tools: {
      list_windows: async () => ({ windows: getKnownWindows() }),
      rpc_log: async (args) =>
        ({ entries: getRpcLog((args.sinceMs as number) ?? undefined, (args.lastN as number) ?? undefined) }),
      ffi_log: async (args) =>
        ({ entries: getFfiLog((args.sinceMs as number) ?? undefined, (args.lastN as number) ?? undefined) }),
      bun_eval: async (args) => {
        const code = String(args.code ?? "");
        // Accept either an expression or a statement-body. If the code looks
        // like a single expression (no statement keywords, no semicolons),
        // wrap as `return (code)`. Otherwise treat as a function body and
        // expect the caller to use a `return` statement.
        const looksLikeExpression =
          !/^\s*(let|const|var|if|for|while|try|switch|class|function|throw|return)\b/.test(code) &&
          !code.trim().includes(";");
        const body = looksLikeExpression ? `return (${code});` : code;
        // eslint-disable-next-line no-new-func
        const result = await (new Function(`return (async () => { ${body} })()`))();
        return { result, type: typeof result };
      },
      updater_state: async () => ({ state: await getUpdaterState() }),
      app_log: async (args) =>
        ({ entries: getAppLog({ sinceMs: args.sinceMs as number | undefined, lastN: args.lastN as number | undefined }) }),
      native_log: async (args) =>
        await getNativeLogWindows({
          sinceMs: args.sinceMs as number | undefined,
          lastN: args.lastN as number | undefined,
          process: args.process as string | undefined,
        }),
    },
  });

  return serverInstance;
}

export function stop(): void {
  if (serverInstance) {
    serverInstance.stop();
    serverInstance = null;
  }
}

export const devtools = { start, stop, trackWindow };

export type { Server, ServerOptions };
