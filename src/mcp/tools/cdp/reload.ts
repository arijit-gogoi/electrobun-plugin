// electrobun_reload — reload a webview.

import type { AuthConfig } from "../../auth.ts";
import { requireToken } from "../../auth.ts";
import { ensureSession, getCDPClient } from "../../transport/cdp-client.ts";

export const reloadSchema = {
  name: "electrobun_reload",
  description: "Reload a webview. Use `electrobun_list_views` first to get the viewId.",
  inputSchema: {
    type: "object",
    properties: {
      viewId: { type: "string" },
      ignoreCache: { type: "boolean", default: false },
    },
    required: ["viewId"],
  },
} as const;

export async function reload(
  cfg: AuthConfig,
  args: { viewId: string; ignoreCache?: boolean },
): Promise<{ ok: true }> {
  requireToken(cfg);
  const cdp = getCDPClient(cfg.cdpPort);
  await cdp.connect();
  const sessionId = await ensureSession(cdp, cfg.cdpPort, args.viewId);
  await cdp.send("Page.reload", { ignoreCache: args.ignoreCache ?? false }, sessionId);
  return { ok: true };
}
