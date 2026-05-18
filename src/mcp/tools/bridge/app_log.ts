// electrobun_app_log — recent bun process console output.

import type { AuthConfig } from "../../auth.ts";
import { requireToken } from "../../auth.ts";
import { getDevtoolsClient } from "../../transport/devtools-client.ts";

export const appLogSchema = {
  name: "electrobun_app_log",
  description:
    "Recent console output from the bun main process (console.log/info/warn/error). Captured by electrobun-devtools since the app started.",
  inputSchema: {
    type: "object",
    properties: {
      sinceMs: { type: "number", default: 60_000 },
      lastN: { type: "number", default: 200 },
    },
    required: [],
  },
} as const;

export async function appLog(cfg: AuthConfig, args: { sinceMs?: number; lastN?: number }): Promise<unknown> {
  requireToken(cfg);
  const client = getDevtoolsClient(cfg.devtoolsPort, cfg.devSessionToken);
  return await client.call("app_log", args);
}
