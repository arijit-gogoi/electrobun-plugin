// Token-based auth for all MCP tool calls.
// V16: every tool call must pass token check before exec.
// V17: bun_eval doubly-gated (token AND userConfig.allowEval).

export type AuthConfig = {
  devSessionToken: string;
  cdpPort: number;
  devtoolsPort: number;
  allowEval: boolean;
};

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function loadAuthConfig(): AuthConfig {
  // Claude Code pipes plugin userConfig values via env vars prefixed with the
  // plugin name. Exact prefix may vary across versions; we check the documented
  // patterns and fall back gracefully.
  const env = process.env;

  const devSessionToken =
    env.ELECTROBUN_DEV_SESSION_TOKEN ??
    env["CLAUDE_PLUGIN_CONFIG_devSessionToken"] ??
    env["claude_plugin_config_devSessionToken"] ??
    "";

  const cdpPortRaw =
    env.ELECTROBUN_CDP_PORT ??
    env["CLAUDE_PLUGIN_CONFIG_cdpPort"] ??
    "9222";

  const devtoolsPortRaw =
    env.ELECTROBUN_DEVTOOLS_PORT ??
    env["CLAUDE_PLUGIN_CONFIG_devtoolsPort"] ??
    "9876";

  const allowEvalRaw =
    env.ELECTROBUN_ALLOW_EVAL ??
    env["CLAUDE_PLUGIN_CONFIG_allowEval"] ??
    "false";

  return {
    devSessionToken,
    cdpPort: Number.parseInt(cdpPortRaw, 10) || 9222,
    devtoolsPort: Number.parseInt(devtoolsPortRaw, 10) || 9876,
    allowEval: allowEvalRaw === "true" || allowEvalRaw === "1",
  };
}

export function requireToken(cfg: AuthConfig): void {
  if (!cfg.devSessionToken) {
    throw new AuthError(
      "No devSessionToken configured. Configure it in the plugin settings " +
        "(/plugin) — paste the token printed by `electrobun-devtools` " +
        "when your app starts in dev mode.",
    );
  }
}

export function requireEvalAllowed(cfg: AuthConfig): void {
  if (!cfg.allowEval) {
    throw new AuthError(
      "bun_eval refused: allowEval is off. Set `allowEval: true` in the " +
        "plugin user config to enable code execution in the main process. " +
        "High blast radius — only enable for trusted sessions.",
    );
  }
}
