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

export async function installFfiHook(
  provided?: { ffi?: { request?: Record<string, Function>; internal?: Record<string, Function> } },
): Promise<void> {
  let ffi = provided?.ffi as Record<string, unknown> | undefined;

  if (!ffi) {
    // Fallback to dynamic import (works only in non-bundled contexts).
    const candidatePaths = [
      "electrobun/dist/api/bun/proc/native",
      "electrobun/dist/api/bun/proc/native.ts",
      "electrobun/bun",
    ];
    for (const path of candidatePaths) {
      try {
        // @ts-ignore — dynamic
        const mod = await import(path);
        const candidate = (mod as Record<string, unknown>).ffi as Record<string, unknown> | undefined;
        if (candidate && typeof candidate === "object") {
          ffi = candidate;
          break;
        }
      } catch {
        // try next
      }
    }
  }

  if (!ffi || typeof ffi !== "object") {
    console.warn(
      "[electrobun-devtools] could not locate electrobun ffi for hook install. " +
        "For bundled builds, pass { electrobun: { ffi } } to devtools.start().",
    );
    return;
  }

  if (typeof ffi.request === "object" && ffi.request !== null) {
    const orig = ffi.request as Record<string, Function>;
    const wrapped = wrapProxy("request", orig);
    for (const key of Object.keys(orig)) {
      const fn = orig[key];
      if (typeof fn !== "function") continue;
      orig[key] = (wrapped as Record<string, Function>)[key];
    }
  }
  if (typeof ffi.internal === "object" && ffi.internal !== null) {
    const orig = ffi.internal as Record<string, Function>;
    const wrapped = wrapProxy("internal", orig);
    for (const key of Object.keys(orig)) {
      const fn = orig[key];
      if (typeof fn !== "function") continue;
      orig[key] = (wrapped as Record<string, Function>)[key];
    }
  }
}
