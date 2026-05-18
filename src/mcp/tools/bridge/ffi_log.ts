// electrobun_ffi_log — recent native FFI calls.

import type { AuthConfig } from "../../auth.ts";
import { requireToken } from "../../auth.ts";
import { getDevtoolsClient } from "../../transport/devtools-client.ts";

export const ffiLogSchema = {
  name: "electrobun_ffi_log",
  description:
    "Recent native FFI calls bun has made (e.g. createWindow, loadURL, clipboardWriteText). Captured by electrobun-devtools via proxy around ffi.request/ffi.internal. Shows symbol name, args, result, duration.",
  inputSchema: {
    type: "object",
    properties: {
      sinceMs: { type: "number", default: 60_000 },
      lastN: { type: "number", default: 200 },
    },
    required: [],
  },
} as const;

export async function ffiLog(cfg: AuthConfig, args: { sinceMs?: number; lastN?: number }): Promise<unknown> {
  requireToken(cfg);
  const client = getDevtoolsClient(cfg.devtoolsPort, cfg.devSessionToken);
  return await client.call("ffi_log", args);
}
