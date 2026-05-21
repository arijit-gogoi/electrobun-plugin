// electrobun_network — recent HTTP requests in a webview.

import type { AuthConfig } from "../../auth.ts";

import { ensureSession, getCDPClient } from "../../transport/cdp-client.ts";

export const networkSchema = {
  name: "electrobun_network",
  description:
    "Get recent HTTP requests made by a webview. Returns method, url, status, mimeType, timestamp. Subscription is LAZY — buffer starts on the first call to this tool. Call once to start observing, then trigger requests, then call again to read entries. Requests fired before the first call are NOT captured.",
  inputSchema: {
    type: "object",
    properties: {
      viewId: { type: "string" },
      sinceMs: { type: "number", default: 60_000 },
      lastN: { type: "number", default: 100 },
    },
    required: ["viewId"],
  },
} as const;

type NetEntry = {
  requestId: string;
  ts: number;
  method?: string;
  url: string;
  status?: number;
  mimeType?: string;
  fromCache?: boolean;
};

const buffers = new Map<string, NetEntry[]>();
const subscribed = new Set<string>();
const MAX_BUFFER = 500;

async function ensureSubscribed(cfg: AuthConfig, viewId: string): Promise<string> {
  const cdp = getCDPClient(cfg.cdpPort);
  await cdp.connect();
  const sessionId = await ensureSession(cdp, cfg.cdpPort, viewId);
  const key = `${cfg.cdpPort}:${sessionId}`;
  if (subscribed.has(key)) return sessionId;
  subscribed.add(key);

  await cdp.send("Network.enable", {}, sessionId);

  const pending = new Map<string, NetEntry>();

  cdp.on("Network.requestWillBeSent", (e) => {
    if (e.sessionId !== sessionId) return;
    const p = e.params as { requestId: string; request: { url: string; method: string } };
    const entry: NetEntry = {
      requestId: p.requestId,
      ts: Date.now(),
      method: p.request.method,
      url: p.request.url,
    };
    pending.set(p.requestId, entry);
    const buf = buffers.get(key) ?? [];
    buf.push(entry);
    if (buf.length > MAX_BUFFER) buf.splice(0, buf.length - MAX_BUFFER);
    buffers.set(key, buf);
  });

  cdp.on("Network.responseReceived", (e) => {
    if (e.sessionId !== sessionId) return;
    const p = e.params as {
      requestId: string;
      response: { status: number; mimeType: string; fromDiskCache?: boolean };
    };
    const entry = pending.get(p.requestId);
    if (!entry) return;
    entry.status = p.response.status;
    entry.mimeType = p.response.mimeType;
    entry.fromCache = p.response.fromDiskCache;
    pending.delete(p.requestId);
  });

  return sessionId;
}

export async function getNetwork(
  cfg: AuthConfig,
  args: { viewId: string; sinceMs?: number; lastN?: number },
): Promise<{ entries: NetEntry[] }> {
  const sessionId = await ensureSubscribed(cfg, args.viewId);
  const key = `${cfg.cdpPort}:${sessionId}`;
  const buf = buffers.get(key) ?? [];
  const cutoff = Date.now() - (args.sinceMs ?? 60_000);
  const filtered = buf.filter((e) => e.ts >= cutoff);
  const n = args.lastN ?? 100;
  return { entries: filtered.slice(-n) };
}
