// WebSocket server that exposes runtime state of the user's electrobun app
// to the electrobun-plugin MCP server.
//
// V16: every tool call goes through token auth.
// V19: strict version lock with the plugin.
// V20: refuses to start in production.
// V23: persistent token at .electrobun-devtools-token in app dir.
// V24: TS source publish — no bundling.
// V25: Windows-first native_log.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

import {
  PROTOCOL_VERSION,
  versionsMatch,
  type ClientHandshake,
  type ClientMessage,
  type ServerHandshake,
  type ServerMessage,
  type ToolCall,
  type ToolResult,
} from "./protocol.ts";

// Resolved at runtime — published package reads from package.json.
const PKG_VERSION = "0.2.0";

export type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export type ServerOptions = {
  port?: number;
  forceToken?: boolean;
  tokenFile?: string; // override path
  tools: Record<string, ToolHandler>;
};

function ensureToken(opts: ServerOptions): string {
  const path = resolve(process.cwd(), opts.tokenFile ?? ".electrobun-devtools-token");
  if (opts.forceToken && existsSync(path)) {
    unlinkSync(path);
  }
  if (existsSync(path)) {
    const t = readFileSync(path, "utf8").trim();
    if (t) return t;
  }
  const t = randomBytes(24).toString("hex");
  writeFileSync(path, t, { mode: 0o600 });
  return t;
}

export type Server = {
  port: number;
  token: string;
  stop: () => void;
};

export function startServer(opts: ServerOptions): Server {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "electrobun-devtools refuses to start in production (NODE_ENV === 'production'). " +
        "Wrap your call site in a dev-only check.",
    );
  }

  const port = opts.port ?? 9876;
  const token = ensureToken(opts);

  const serverHello: ServerHandshake = {
    kind: "hello",
    pkg: "electrobun-devtools",
    pkgVersion: PKG_VERSION,
    protocolVersion: PROTOCOL_VERSION,
  };

  // Bun's native serve() with websocket upgrade.
  const server = Bun.serve<{ authed: boolean }>({
    port,
    hostname: "127.0.0.1",
    fetch(req, srv) {
      if (srv.upgrade(req, { data: { authed: false } })) return;
      return new Response("electrobun-devtools — connect via WebSocket", { status: 426 });
    },
    websocket: {
      open(ws) {
        ws.send(JSON.stringify(serverHello));
      },
      async message(ws, raw) {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          ws.close(1003, "invalid JSON");
          return;
        }

        // Auth handshake
        if (msg.kind === "auth") {
          const auth = msg as ClientHandshake;
          if (!versionsMatch(auth.protocolVersion, PROTOCOL_VERSION)) {
            ws.send(
              JSON.stringify({
                kind: "auth-error",
                reason: "version-mismatch",
                message: `client protocol ${auth.protocolVersion} != server ${PROTOCOL_VERSION}`,
              } satisfies ServerMessage),
            );
            ws.close(1008, "version mismatch");
            return;
          }
          if (auth.token !== token) {
            ws.send(
              JSON.stringify({
                kind: "auth-error",
                reason: "bad-token",
                message: "token mismatch",
              } satisfies ServerMessage),
            );
            ws.close(1008, "bad token");
            return;
          }
          ws.data.authed = true;
          ws.send(JSON.stringify({ kind: "auth-ok" } satisfies ServerMessage));
          return;
        }

        // Tool call
        if (msg.kind === "tool-call") {
          if (!ws.data.authed) {
            const r: ToolResult = {
              kind: "tool-result",
              id: msg.id,
              ok: false,
              error: "not authenticated",
            };
            ws.send(JSON.stringify(r));
            return;
          }
          const handler = opts.tools[msg.name];
          if (!handler) {
            const r: ToolResult = {
              kind: "tool-result",
              id: msg.id,
              ok: false,
              error: `unknown tool: ${msg.name}`,
            };
            ws.send(JSON.stringify(r));
            return;
          }
          try {
            const data = await handler(msg.args ?? {});
            const r: ToolResult = { kind: "tool-result", id: msg.id, ok: true, data };
            ws.send(JSON.stringify(r));
          } catch (err) {
            const r: ToolResult = {
              kind: "tool-result",
              id: msg.id,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            };
            ws.send(JSON.stringify(r));
          }
          return;
        }
      },
      close() {
        // no-op
      },
    },
  });

  console.log(`[electrobun-devtools] listening on ws://127.0.0.1:${port}`);
  console.log(`[electrobun-devtools] token: ${token}`);
  console.log(`[electrobun-devtools] paste the token into the electrobun-plugin user-config in Claude Code.`);

  return {
    port,
    token,
    stop() {
      server.stop(true);
    },
  };
}
