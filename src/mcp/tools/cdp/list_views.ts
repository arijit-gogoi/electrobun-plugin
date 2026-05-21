// electrobun_list_views — enumerate all CDP targets (page-type) in the running app.

import type { AuthConfig } from "../../auth.ts";

import { getCDPClient } from "../../transport/cdp-client.ts";

export const listViewsSchema = {
  name: "electrobun_list_views",
  description:
    "List all BrowserView webviews currently open in the running Electrobun app. Returns id, type, title, url for each. Use this first to get viewIds for other CDP tools (eval, dom, navigate, reload, screenshot, console, network, devtools).",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
} as const;

export type ListViewsResult = {
  views: Array<{
    id: string;
    title: string;
    url: string;
    type: string;
  }>;
};

export async function listViews(cfg: AuthConfig): Promise<ListViewsResult> {
  const cdp = getCDPClient(cfg.cdpPort);
  const targets = await cdp.listTargets();
  return {
    views: targets
      .filter((t) => t.type === "page" || t.type === "iframe")
      .map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        type: t.type,
      })),
  };
}
