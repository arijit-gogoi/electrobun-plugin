// electrobun_list_windows — enumerate BrowserWindow instances via devtools bridge.

import type { AuthConfig } from "../../auth.ts";

import { getDevtoolsClient } from "../../transport/devtools-client.ts";

export const listWindowsSchema = {
  name: "electrobun_list_windows",
  description:
    "Enumerate BrowserWindow instances in the running app via electrobun-devtools (bun-side, distinct from CDP webview-level `electrobun_list_views`). Requires user's app to import + start electrobun-devtools.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
} as const;

export async function listWindows(cfg: AuthConfig): Promise<unknown> {
  const client = getDevtoolsClient(cfg.devtoolsPort);
  return await client.call("list_windows");
}
