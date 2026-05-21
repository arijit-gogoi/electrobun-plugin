// electrobun_bun_eval — evaluate code in the bun main process.
// V17: DOUBLE-GATED. Token + userConfig.allowEval.

import type { AuthConfig } from "../../auth.ts";
import { requireEvalAllowed } from "../../auth.ts";
import { getDevtoolsClient } from "../../transport/devtools-client.ts";

export const bunEvalSchema = {
  name: "electrobun_bun_eval",
  description:
    "Evaluate JavaScript in the bun MAIN PROCESS (not in a webview — for that use `electrobun_eval`). HIGH BLAST RADIUS. Requires `allowEval: true` in plugin user-config. Use sparingly to inspect state or trigger debug actions.",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "JavaScript to evaluate. Can be a single expression or a multi-line block ending in a return-value expression." },
    },
    required: ["code"],
  },
} as const;

export async function bunEval(cfg: AuthConfig, args: { code: string }): Promise<unknown> {
  requireEvalAllowed(cfg);
  const client = getDevtoolsClient(cfg.devtoolsPort);
  return await client.call("bun_eval", { code: args.code });
}
