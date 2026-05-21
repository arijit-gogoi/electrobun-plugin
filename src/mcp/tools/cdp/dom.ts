// electrobun_dom — get serialized DOM of a webview.

import type { AuthConfig } from "../../auth.ts";

import { ensureSession, getCDPClient } from "../../transport/cdp-client.ts";

export const domSchema = {
  name: "electrobun_dom",
  description:
    "Get the serialized DOM of a webview as an HTML string. For querying specific elements, use `electrobun_eval` with document.querySelector.",
  inputSchema: {
    type: "object",
    properties: {
      viewId: { type: "string" },
      depth: { type: "number", default: -1 },
    },
    required: ["viewId"],
  },
} as const;

export async function getDom(
  cfg: AuthConfig,
  args: { viewId: string; depth?: number },
): Promise<{ html: string }> {
  const cdp = getCDPClient(cfg.cdpPort);
  await cdp.connect();
  const sessionId = await ensureSession(cdp, cfg.cdpPort, args.viewId);

  const doc = await cdp.send<{ root: { nodeId: number } }>(
    "DOM.getDocument",
    { depth: args.depth ?? -1 },
    sessionId,
  );

  const html = await cdp.send<{ outerHTML: string }>(
    "DOM.getOuterHTML",
    { nodeId: doc.root.nodeId },
    sessionId,
  );

  return { html: html.outerHTML };
}
