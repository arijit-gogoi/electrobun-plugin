// Observes BrowserWindow lifecycle and updater state.
//
// Best-effort: reads electrobun's internal maps if exposed; otherwise
// tracks via patched constructors.

export type WindowInfo = {
  id: number | string;
  title?: string;
  url?: string;
  width?: number;
  height?: number;
  webviewId?: number | string;
};

const tracked = new Map<number | string, WindowInfo>();

export function getKnownWindows(): WindowInfo[] {
  return [...tracked.values()];
}

export async function installWindowHook(): Promise<void> {
  try {
    // @ts-expect-error — dynamic
    const mod = await import("electrobun/bun").catch(() => null);
    if (!mod) return;

    // Look for the BrowserWindowMap global the electrobun source maintains.
    const browserWindowMap = (mod as Record<string, unknown>).BrowserWindowMap as
      | Map<unknown, unknown>
      | undefined;
    if (browserWindowMap instanceof Map) {
      // Snapshot via the live map.
      const sync = () => {
        tracked.clear();
        for (const [k, v] of browserWindowMap.entries()) {
          const win = v as { id?: number | string; title?: string; url?: string };
          tracked.set(k as number | string, {
            id: k as number | string,
            title: win.title,
            url: win.url,
          });
        }
      };
      sync();
      // Poll cheaply — windows change infrequently.
      setInterval(sync, 1000).unref?.();
      return;
    }

    // Fallback: wrap BrowserWindow constructor.
    const BrowserWindow = (mod as Record<string, unknown>).BrowserWindow as
      | (new (...args: unknown[]) => Record<string, unknown>)
      | undefined;
    if (!BrowserWindow) return;

    let nextId = 1;
    const patched = function (this: unknown, ...args: unknown[]) {
      // @ts-expect-error — Reflect.construct
      const instance = Reflect.construct(BrowserWindow, args, patched);
      const id = nextId++;
      const opts = (args[0] as Record<string, unknown>) ?? {};
      tracked.set(id, {
        id,
        title: opts.title as string | undefined,
        url: opts.url as string | undefined,
        width: opts.width as number | undefined,
        height: opts.height as number | undefined,
      });
      return instance;
    };
    Object.setPrototypeOf(patched, BrowserWindow);
    patched.prototype = BrowserWindow.prototype;
    (mod as Record<string, unknown>).BrowserWindow = patched;
  } catch (err) {
    console.warn(
      "[electrobun-devtools] window hook install failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function getUpdaterState(): Promise<Record<string, unknown> | { error: string }> {
  try {
    // @ts-expect-error — dynamic
    const mod = await import("electrobun/bun").catch(() => null);
    if (!mod) return { error: "electrobun/bun not loadable" };
    const Updater = (mod as Record<string, unknown>).Updater as
      | Record<string, Function | unknown>
      | undefined;
    if (!Updater) return { error: "Updater not exported" };

    const state: Record<string, unknown> = {};
    for (const key of ["currentVersion", "channel", "isChecking", "isDownloading"]) {
      const v = (Updater as Record<string, unknown>)[key];
      if (typeof v !== "function") state[key] = v;
    }

    // localInfo.getLocalInfo() in v1.18.0+
    const localInfo = (Updater as Record<string, unknown>).localInfo as
      | { getLocalInfo?: () => Record<string, unknown> }
      | undefined;
    if (localInfo?.getLocalInfo) {
      try {
        state.localInfo = localInfo.getLocalInfo();
      } catch {
        // ignore
      }
    }
    return state;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
