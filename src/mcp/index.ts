#!/usr/bin/env bun
// electrobun-plugin MCP server — stdio transport.
//
// V15: stdio only.
// V16: every tool call authenticated via session token.
// V17: bun_eval double-gated (token + allowEval).
//
// v0.2.0-b: 9 CDP tools wired (Tier 1).
// v0.2.0 final: + 7 bridge tools (Tier 2 via electrobun-devtools).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { AuthError, loadAuthConfig } from "./auth.ts";

import { evalInView, evalSchema } from "./tools/cdp/eval.ts";
import { getConsole, consoleSchema } from "./tools/cdp/console.ts";
import { getDevtoolsUrl, devtoolsSchema } from "./tools/cdp/devtools.ts";
import { getDom, domSchema } from "./tools/cdp/dom.ts";
import { getNetwork, networkSchema } from "./tools/cdp/network.ts";
import { listViews, listViewsSchema } from "./tools/cdp/list_views.ts";
import { navigate, navigateSchema } from "./tools/cdp/navigate.ts";
import { reload, reloadSchema } from "./tools/cdp/reload.ts";
import { screenshot, screenshotSchema } from "./tools/cdp/screenshot.ts";

const PLUGIN_VERSION = "0.2.0-b";

const server = new Server(
  { name: "electrobun", version: PLUGIN_VERSION },
  { capabilities: { tools: {} } },
);

// ── Tool dispatch table ───────────────────────────────────────────────

type ToolFn = (cfg: ReturnType<typeof loadAuthConfig>, args: any) => Promise<unknown>;

const tools: Array<{ schema: { name: string; description: string; inputSchema: unknown }; fn: ToolFn }> = [
  { schema: listViewsSchema, fn: (cfg) => listViews(cfg) },
  { schema: evalSchema, fn: (cfg, a) => evalInView(cfg, a) },
  { schema: navigateSchema, fn: (cfg, a) => navigate(cfg, a) },
  { schema: reloadSchema, fn: (cfg, a) => reload(cfg, a) },
  { schema: screenshotSchema, fn: (cfg, a) => screenshot(cfg, a) },
  { schema: domSchema, fn: (cfg, a) => getDom(cfg, a) },
  { schema: consoleSchema, fn: (cfg, a) => getConsole(cfg, a) },
  { schema: networkSchema, fn: (cfg, a) => getNetwork(cfg, a) },
  { schema: devtoolsSchema, fn: (cfg, a) => getDevtoolsUrl(cfg, a) },
];

const toolByName = new Map(tools.map((t) => [t.schema.name, t]));

// ── Handlers ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => t.schema),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = toolByName.get(name);
  if (!tool) {
    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  }

  const cfg = loadAuthConfig();
  try {
    const result = await tool.fn(cfg, args ?? {});

    // Screenshot returns image content; everything else returns text+JSON.
    if (name === "electrobun_screenshot" && typeof result === "object" && result !== null && "data" in result) {
      const r = result as { mimeType: string; data: string };
      return {
        content: [
          { type: "image", data: r.data, mimeType: r.mimeType },
        ],
      };
    }

    return {
      content: [
        { type: "text", text: JSON.stringify(result, null, 2) },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const kind = err instanceof AuthError ? "auth" : "error";
    return {
      isError: true,
      content: [{ type: "text", text: `[${kind}] ${msg}` }],
    };
  }
});

// ── Boot ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // No stdout writes — stdio transport owns it.
  console.error(`electrobun-plugin MCP ${PLUGIN_VERSION} ready (${tools.length} tools)`);
}

main().catch((err) => {
  console.error("Fatal MCP server error:", err);
  process.exit(1);
});
