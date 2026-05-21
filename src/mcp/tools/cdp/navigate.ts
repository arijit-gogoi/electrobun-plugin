// electrobun_navigate — navigate a webview to a URL.

import type { AuthConfig } from "../../auth.ts";

import { ensureSession, getCDPClient } from "../../transport/cdp-client.ts";

export const navigateSchema = {
  name: "electrobun_navigate",
  description:
    "Navigate a webview to a URL. Accepts views://, http(s)://, file://. Use `electrobun_list_views` first to get viewId. Native navigation rules apply.",
  inputSchema: {
    type: "object",
    properties: {
      viewId: { type: "string" },
      url: { type: "string" },
    },
    required: ["viewId", "url"],
  },
} as const;

export async function navigate(
  cfg: AuthConfig,
  args: { viewId: string; url: string },
): Promise<{ frameId: string; loaderId: string; errorText?: string }> {
  const cdp = getCDPClient(cfg.cdpPort);
  await cdp.connect();
  const sessionId = await ensureSession(cdp, cfg.cdpPort, args.viewId);
  return await cdp.send("Page.navigate", { url: args.url }, sessionId);
}
