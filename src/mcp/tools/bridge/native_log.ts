// electrobun_native_log — native OS log filtered to the running app.
// V25: Windows-first in v0.2; mac/Linux deferred (see specs/roadmap.md).

import type { AuthConfig } from "../../auth.ts";

import { getDevtoolsClient } from "../../transport/devtools-client.ts";

export const nativeLogSchema = {
  name: "electrobun_native_log",
  description:
    "Recent native OS log entries (Windows Event Log) filtered to the running app process. v0.2 Windows-only; macOS (Console.app) + Linux (journalctl/syslog) planned per roadmap.",
  inputSchema: {
    type: "object",
    properties: {
      sinceMs: { type: "number", default: 60_000 },
      lastN: { type: "number", default: 100 },
      process: {
        type: "string",
        description: "Process name to filter Event Log entries by. Defaults to 'bun'.",
        default: "bun",
      },
    },
    required: [],
  },
} as const;

export async function nativeLog(
  cfg: AuthConfig,
  args: { sinceMs?: number; lastN?: number; process?: string },
): Promise<unknown> {
  const client = getDevtoolsClient(cfg.devtoolsPort);
  return await client.call("native_log", args);
}
