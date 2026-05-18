// electrobun_updater_state — current state of the Updater.

import type { AuthConfig } from "../../auth.ts";
import { requireToken } from "../../auth.ts";
import { getDevtoolsClient } from "../../transport/devtools-client.ts";

export const updaterStateSchema = {
  name: "electrobun_updater_state",
  description:
    "Get current state of the Updater singleton — version, channel, isChecking, isDownloading, localInfo (v1.18.0+). Useful for debugging update flows.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
} as const;

export async function updaterState(cfg: AuthConfig): Promise<unknown> {
  requireToken(cfg);
  const client = getDevtoolsClient(cfg.devtoolsPort, cfg.devSessionToken);
  return await client.call("updater_state");
}
