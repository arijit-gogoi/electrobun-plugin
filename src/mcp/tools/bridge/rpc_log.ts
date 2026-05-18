// electrobun_rpc_log — recent bun↔webview RPC traffic.

import type { AuthConfig } from "../../auth.ts";
import { requireToken } from "../../auth.ts";
import { getDevtoolsClient } from "../../transport/devtools-client.ts";

export const rpcLogSchema = {
  name: "electrobun_rpc_log",
  description:
    "Recent bun↔webview RPC traffic captured by electrobun-devtools. Shows method name, direction, payload, and timestamp. Requires the user's app to import + start electrobun-devtools.",
  inputSchema: {
    type: "object",
    properties: {
      sinceMs: { type: "number", default: 60_000 },
      lastN: { type: "number", default: 200 },
    },
    required: [],
  },
} as const;

export async function rpcLog(cfg: AuthConfig, args: { sinceMs?: number; lastN?: number }): Promise<unknown> {
  requireToken(cfg);
  const client = getDevtoolsClient(cfg.devtoolsPort, cfg.devSessionToken);
  return await client.call("rpc_log", args);
}
