// Wire protocol between electrobun-devtools (in user's app) and the plugin's
// MCP server. WebSocket, JSON-line messages.
//
// V19: strict version lock — plugin and pkg major.minor must match.

export const PROTOCOL_VERSION = "0.2";

export type ServerHandshake = {
  kind: "hello";
  pkg: "electrobun-devtools";
  pkgVersion: string;
  protocolVersion: string;
};

export type ClientHandshake = {
  kind: "auth";
  token: string;
  protocolVersion: string;
};

export type AuthResult =
  | { kind: "auth-ok" }
  | { kind: "auth-error"; reason: "bad-token" | "version-mismatch" | "in-prod"; message: string };

export type ToolCall = {
  kind: "tool-call";
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type ToolResult =
  | { kind: "tool-result"; id: string; ok: true; data: unknown }
  | { kind: "tool-result"; id: string; ok: false; error: string };

export type ClientMessage = ClientHandshake | ToolCall;
export type ServerMessage = ServerHandshake | AuthResult | ToolResult;

export function versionMajorMinor(version: string): string {
  const [maj, min] = version.split(".");
  return `${maj ?? "0"}.${min ?? "0"}`;
}

export function versionsMatch(a: string, b: string): boolean {
  return versionMajorMinor(a) === versionMajorMinor(b);
}
