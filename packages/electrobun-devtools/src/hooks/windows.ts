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

export async function installWindowHook(
  provided?: { BrowserWindowMap?: Record<number, unknown> | Map<unknown, unknown> },
): Promise<void> {
  try {
    let browserWindowMap: Record<number, unknown> | Map<unknown, unknown> | undefined = provided?.BrowserWindowMap;

    if (!browserWindowMap) {
      // Fallback to dynamic import (won't work in bundled builds)
      const candidates = [
        "electrobun/dist/api/bun/core/BrowserWindow",
        "electrobun/dist/api/bun/core/BrowserWindow.ts",
        "electrobun/bun",
      ];
      for (const path of candidates) {
        try {
          // @ts-expect-error — dynamic
          const mod = await import(path);
          const m = (mod as Record<string, unknown>).BrowserWindowMap;
          if (m && (typeof m === "object" || m instanceof Map)) {
            browserWindowMap = m as Record<number, unknown> | Map<unknown, unknown>;
            break;
          }
        } catch {
          // try next
        }
      }
    }

    if (browserWindowMap) {
      const sync = () => {
        tracked.clear();
        const entries = browserWindowMap instanceof Map
          ? Array.from(browserWindowMap.entries())
          : Object.entries(browserWindowMap);
        for (const [k, v] of entries) {
          const win = v as { id?: number | string; title?: string; url?: string; webview?: { url?: string } };
          tracked.set(k as number | string, {
            id: (typeof k === "string" ? Number(k) : k) as number | string,
            title: win.title,
            url: win.url ?? win.webview?.url,
          });
        }
      };
      sync();
      setInterval(sync, 1000).unref?.();
      return;
    }

    // No BrowserWindowMap available (electrobun's exports field hides it).
    // Fall back to: rely on user calling `trackWindow(win)` after creating each.
    console.warn(
      "[electrobun-devtools] BrowserWindowMap not reachable; call devtools.trackWindow(win) " +
        "after each `new BrowserWindow(...)` to populate list_windows.",
    );
  } catch (err) {
    console.warn(
      "[electrobun-devtools] window hook install failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

export function trackWindow(win: { id?: number | string; title?: string; webview?: { url?: string } }): void {
  if (win.id == null) return;
  tracked.set(win.id, { id: win.id, title: win.title, url: win.webview?.url });
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
