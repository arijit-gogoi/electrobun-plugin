// electrobun_console — recent console messages from a webview.

import type { AuthConfig } from "../../auth.ts";
import { requireToken } from "../../auth.ts";
import { ensureSession, getCDPClient } from "../../transport/cdp-client.ts";

export const consoleSchema = {
  name: "electrobun_console",
  description:
    "Get recent console messages from a webview (log/info/warn/error/debug). Buffered per-view since the MCP server started observing.",
  inputSchema: {
    type: "object",
    properties: {
      viewId: { type: "string" },
      level: {
        type: "string",
        enum: ["all", "error", "warning", "info", "log", "debug"],
        default: "all",
      },
      lastN: { type: "number", default: 100 },
    },
    required: ["viewId"],
  },
} as const;

type Msg = {
  ts: number;
  level: string;
  args: Array<{ type: string; value?: unknown; description?: string }>;
  stackTrace?: unknown;
};

const buffers = new Map<string, Msg[]>();
const subscribed = new Set<string>();
const MAX_BUFFER = 500;

async function ensureSubscribed(cfg: AuthConfig, viewId: string): Promise<string> {
  const cdp = getCDPClient(cfg.cdpPort);
  await cdp.connect();
  const sessionId = await ensureSession(cdp, cfg.cdpPort, viewId);
  const key = `${cfg.cdpPort}:${sessionId}`;
  if (subscribed.has(key)) return sessionId;
  subscribed.add(key);

  await cdp.send("Runtime.enable", {}, sessionId);

  cdp.on("Runtime.consoleAPICalled", (e) => {
    if (e.sessionId !== sessionId) return;
    const buf = buffers.get(key) ?? [];
    const p = e.params as { type: string; args: Msg["args"]; stackTrace?: unknown };
    buf.push({
      ts: Date.now(),
      level: p.type,
      args: p.args,
      stackTrace: p.stackTrace,
    });
    if (buf.length > MAX_BUFFER) buf.splice(0, buf.length - MAX_BUFFER);
    buffers.set(key, buf);
  });

  return sessionId;
}

export async function getConsole(
  cfg: AuthConfig,
  args: { viewId: string; level?: string; lastN?: number },
): Promise<{ messages: Msg[] }> {
  requireToken(cfg);
  const sessionId = await ensureSubscribed(cfg, args.viewId);
  const key = `${cfg.cdpPort}:${sessionId}`;
  const buf = buffers.get(key) ?? [];
  const lvl = args.level ?? "all";
  const filtered = lvl === "all" ? buf : buf.filter((m) => m.level === lvl);
  const n = args.lastN ?? 100;
  return { messages: filtered.slice(-n) };
}
