// Monkey-patches electrobun's FFI proxy to log every native call.
//
// Target: electrobun's bun/proc/native.ts exposes `ffi.request.*` and
// `ffi.internal.*` proxies that route to libElectrobunCore via dlopen.
// Wrapping the proxy lets us log args + return values without touching
// the native layer.

export type FfiLogEntry = {
  ts: number;
  ns: "request" | "internal";
  symbol: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  durationMs?: number;
};

const MAX_BUFFER = 1000;
const buffer: FfiLogEntry[] = [];

function push(entry: FfiLogEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
}

export function getFfiLog(sinceMs?: number, lastN?: number): FfiLogEntry[] {
  const cutoff = Date.now() - (sinceMs ?? 60_000);
  const filtered = buffer.filter((e) => e.ts >= cutoff);
  return filtered.slice(-(lastN ?? 200));
}

function wrapProxy<T extends Record<string, Function>>(ns: "request" | "internal", target: T): T {
  return new Proxy(target, {
    get(t, prop) {
      const orig = (t as Record<string | symbol, unknown>)[prop];
      if (typeof orig !== "function") return orig;
      const sym = String(prop);
      return (...args: unknown[]) => {
        const ts = Date.now();
        try {
          const result = (orig as Function).apply(t, args);
          if (result && typeof (result as Promise<unknown>).then === "function") {
            return (result as Promise<unknown>).then(
              (r) => {
                push({ ts, ns, symbol: sym, args, result: r, durationMs: Date.now() - ts });
                return r;
              },
              (err: unknown) => {
                push({
                  ts,
                  ns,
                  symbol: sym,
                  args,
                  error: err instanceof Error ? err.message : String(err),
                  durationMs: Date.now() - ts,
                });
                throw err;
              },
            );
          }
          push({ ts, ns, symbol: sym, args, result, durationMs: Date.now() - ts });
          return result;
        } catch (err) {
          push({
            ts,
            ns,
            symbol: sym,
            args,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - ts,
          });
          throw err;
        }
      };
    },
  }) as T;
}

export async function installFfiHook(): Promise<void> {
  try {
    // @ts-expect-error — dynamic, electrobun is peerDep
    const mod = await import("electrobun/bun").catch(() => null);
    if (!mod) {
      console.warn("[electrobun-devtools] could not load electrobun/bun for FFI hook");
      return;
    }

    // electrobun exposes `ffi` via a singleton; we look it up and replace its
    // .request and .internal proxies. Path may vary across versions; best-effort.
    const candidates = [
      (mod as Record<string, unknown>).ffi,
      (mod as Record<string, unknown>).native,
      (mod as Record<string, unknown>).proc,
    ].filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>;

    for (const c of candidates) {
      if (typeof c.request === "object" && c.request !== null) {
        c.request = wrapProxy("request", c.request as Record<string, Function>);
      }
      if (typeof c.internal === "object" && c.internal !== null) {
        c.internal = wrapProxy("internal", c.internal as Record<string, Function>);
      }
    }
  } catch (err) {
    console.warn("[electrobun-devtools] FFI hook install failed:", err instanceof Error ? err.message : err);
  }
}
