// electrobun_devtools — open native devtools UI for a webview.

import type { AuthConfig } from "../../auth.ts";
import { requireToken } from "../../auth.ts";
import { getCDPClient } from "../../transport/cdp-client.ts";

export const devtoolsSchema = {
  name: "electrobun_devtools",
  description:
    "Open native (Chrome) DevTools UI for a webview. Returns a URL the user can open in their default browser to render DevTools attached to the live webview.",
  inputSchema: {
    type: "object",
    properties: {
      viewId: { type: "string" },
    },
    required: ["viewId"],
  },
} as const;

export async function getDevtoolsUrl(
  cfg: AuthConfig,
  args: { viewId: string },
): Promise<{ devtoolsUrl: string | null; hint: string }> {
  requireToken(cfg);
  const cdp = getCDPClient(cfg.cdpPort);
  const targets = await cdp.listTargets();
  const target = targets.find((t) => t.id === args.viewId);
  if (!target) {
    return {
      devtoolsUrl: null,
      hint: `View id ${args.viewId} not found. Run electrobun_list_views to refresh.`,
    };
  }
  const url = target.devtoolsFrontendUrl;
  if (!url) {
    return {
      devtoolsUrl: null,
      hint:
        "This CDP target has no devtoolsFrontendUrl. Use webview.openDevTools() from the bun side instead, or browse http://localhost:" +
        cfg.cdpPort +
        " for available targets.",
    };
  }
  const full = url.startsWith("ws") || url.startsWith("http")
    ? url
    : `http://localhost:${cfg.cdpPort}${url.startsWith("/") ? "" : "/"}${url}`;
  return {
    devtoolsUrl: full,
    hint: "Open this URL in your default browser to see Chrome DevTools attached to the live webview.",
  };
}
