// Monkey-patches electrobun's shared/rpc.ts to log every bun↔webview message.
// V14 (parent SPEC): Tier 2 surface — RPC interception via monkey-patch.
//
// Strategy: import electrobun's shared/rpc module, wrap createRPC + the
// inner createTransport so every send/registerHandler call gets logged
// to a ring buffer the server.ts WS exposes via the rpc_log tool.

export type RpcLogEntry = {
  ts: number;
  direction: "bun→view" | "view→bun";
  kind: "request" | "message" | "response";
  method?: string;
  payload?: unknown;
};

const MAX_BUFFER = 1000;
const buffer: RpcLogEntry[] = [];

export function pushRpcEntry(entry: RpcLogEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
}

export function getRpcLog(sinceMs?: number, lastN?: number): RpcLogEntry[] {
  const cutoff = Date.now() - (sinceMs ?? 60_000);
  const filtered = buffer.filter((e) => e.ts >= cutoff);
  return filtered.slice(-(lastN ?? 200));
}

// Hook installer — called once on devtools.start().
// Accepts user-supplied symbols (preferred for bundled builds where runtime
// import("electrobun/...") cannot reach internals). Falls back to dynamic
// import for non-bundled / dev situations.
export async function installRpcHook(
  provided?: { BrowserView?: { defineRPC?: (cfg: Record<string, unknown>) => unknown } },
): Promise<void> {
  try {
    let BrowserView = provided?.BrowserView;

    if (!BrowserView) {
      // @ts-expect-error — dynamic
      const mod = (await import("electrobun/dist/api/bun/index.ts").catch(() => null)) ??
        // @ts-expect-error — dynamic
        (await import("electrobun/bun").catch(() => null));

      if (mod && typeof mod === "object") {
        BrowserView = (mod as Record<string, unknown>).BrowserView as typeof BrowserView;
      }
    }

    if (!BrowserView || typeof BrowserView.defineRPC !== "function") {
      console.warn(
        "[electrobun-devtools] BrowserView.defineRPC not found — RPC hook disabled. " +
          "For bundled builds, pass { electrobun: { BrowserView } } to devtools.start().",
      );
      return;
    }

    const originalDefineRPC = BrowserView.defineRPC.bind(BrowserView);
    BrowserView.defineRPC = function patched(cfg: Record<string, unknown>) {
      const handlers = (cfg.handlers as Record<string, Record<string, Function>> | undefined) ?? {};
      const requests = handlers.requests ?? {};
      const messages = handlers.messages ?? {};

      const wrappedRequests: Record<string, Function> = {};
      for (const [k, fn] of Object.entries(requests)) {
        wrappedRequests[k] = async (args: unknown) => {
          pushRpcEntry({ ts: Date.now(), direction: "view→bun", kind: "request", method: k, payload: args });
          const result = await fn(args);
          pushRpcEntry({ ts: Date.now(), direction: "bun→view", kind: "response", method: k, payload: result });
          return result;
        };
      }
      const wrappedMessages: Record<string, Function> = {};
      for (const [k, fn] of Object.entries(messages)) {
        wrappedMessages[k] = (args: unknown) => {
          pushRpcEntry({ ts: Date.now(), direction: "view→bun", kind: "message", method: k, payload: args });
          return fn(args);
        };
      }

      const newCfg = {
        ...cfg,
        handlers: { ...handlers, requests: wrappedRequests, messages: wrappedMessages },
      };
      return originalDefineRPC(newCfg);
    };
  } catch (err) {
    console.warn("[electrobun-devtools] RPC hook install failed:", err instanceof Error ? err.message : err);
  }
}
