// Auth gates for MCP tool calls.
// V16 (token gate) was removed in v0.2.4 — local-only WS server on 127.0.0.1
// + single-user dev box makes token UX-cost > security-value.
// V17 simplified: bun_eval still gated by userConfig.allowEval (default off).

export type AuthConfig = {
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
  const env = process.env;

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
    cdpPort: Number.parseInt(cdpPortRaw, 10) || 9222,
    devtoolsPort: Number.parseInt(devtoolsPortRaw, 10) || 9876,
    allowEval: allowEvalRaw === "true" || allowEvalRaw === "1",
  };
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
