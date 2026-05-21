// electrobun_screenshot — capture a webview screenshot.

import type { AuthConfig } from "../../auth.ts";

import { ensureSession, getCDPClient } from "../../transport/cdp-client.ts";

export const screenshotSchema = {
  name: "electrobun_screenshot",
  description:
    "Capture a screenshot of a specific webview. Returns base64 PNG/JPEG rendered as image content. Use `electrobun_list_views` first.",
  inputSchema: {
    type: "object",
    properties: {
      viewId: { type: "string" },
      format: { type: "string", enum: ["png", "jpeg"], default: "png" },
      quality: { type: "number", default: 80 },
      fullPage: { type: "boolean", default: false },
    },
    required: ["viewId"],
  },
} as const;

export async function screenshot(
  cfg: AuthConfig,
  args: { viewId: string; format?: "png" | "jpeg"; quality?: number; fullPage?: boolean },
): Promise<{ mimeType: string; data: string }> {
  const cdp = getCDPClient(cfg.cdpPort);
  await cdp.connect();
  const sessionId = await ensureSession(cdp, cfg.cdpPort, args.viewId);

  const fmt = args.format ?? "png";
  const params: Record<string, unknown> = { format: fmt };
  if (fmt === "jpeg") params.quality = args.quality ?? 80;
  if (args.fullPage) params.captureBeyondViewport = true;

  const res = await cdp.send<{ data: string }>(
    "Page.captureScreenshot",
    params,
    sessionId,
  );

  return {
    mimeType: fmt === "png" ? "image/png" : "image/jpeg",
    data: res.data,
  };
}
