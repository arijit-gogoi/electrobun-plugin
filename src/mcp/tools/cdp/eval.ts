// electrobun_eval — evaluate JS in a specific webview via CDP Runtime.evaluate.

import type { AuthConfig } from "../../auth.ts";

import { ensureSession, getCDPClient } from "../../transport/cdp-client.ts";

export const evalSchema = {
  name: "electrobun_eval",
  description:
    "Evaluate a JavaScript expression inside a specific webview (BrowserView). Returns the result as JSON. Use `electrobun_list_views` first to get the viewId.",
  inputSchema: {
    type: "object",
    properties: {
      viewId: { type: "string", description: "Target view id from `electrobun_list_views`." },
      expression: { type: "string", description: "JavaScript expression to evaluate." },
      awaitPromise: { type: "boolean", default: true },
      returnByValue: { type: "boolean", default: true },
    },
    required: ["viewId", "expression"],
  },
} as const;

export type EvalArgs = {
  viewId: string;
  expression: string;
  awaitPromise?: boolean;
  returnByValue?: boolean;
};

export type EvalResult = {
  type: string;
  value?: unknown;
  description?: string;
  exception?: { text: string; stack?: string };
};

export async function evalInView(cfg: AuthConfig, args: EvalArgs): Promise<EvalResult> {
  const cdp = getCDPClient(cfg.cdpPort);
  await cdp.connect();
  const sessionId = await ensureSession(cdp, cfg.cdpPort, args.viewId);

  const res = await cdp.send<{
    result: { type: string; value?: unknown; description?: string };
    exceptionDetails?: { text: string; stackTrace?: { description?: string } };
  }>(
    "Runtime.evaluate",
    {
      expression: args.expression,
      awaitPromise: args.awaitPromise ?? true,
      returnByValue: args.returnByValue ?? true,
      userGesture: true,
    },
    sessionId,
  );

  if (res.exceptionDetails) {
    return {
      type: "exception",
      exception: {
        text: res.exceptionDetails.text,
        stack: res.exceptionDetails.stackTrace?.description,
      },
    };
  }
  return {
    type: res.result.type,
    value: res.result.value,
    description: res.result.description,
  };
}
