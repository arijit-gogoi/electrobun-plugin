// Windows native log tail via PowerShell Get-WinEvent.
// V25: Windows-only in v0.2. mac/Linux → roadmap.
//
// Tails Application + Security event logs filtered to the running process
// name. Returns recent entries on demand (not streaming — pull-based to
// match the rest of the bridge tools).

import { spawnSync } from "node:child_process";

export type NativeLogEntry = {
  ts: number;
  level: string;
  source: string;
  message: string;
  providerName?: string;
};

export async function getNativeLogWindows(args: {
  sinceMs?: number;
  lastN?: number;
  process?: string;
}): Promise<{ entries: NativeLogEntry[]; platform: "windows"; warning?: string }> {
  if (process.platform !== "win32") {
    return {
      entries: [],
      platform: "windows",
      warning: `native_log Windows backend invoked on ${process.platform}. v0.2 Windows-only; mac/Linux planned (see roadmap).`,
    };
  }

  const sinceMs = args.sinceMs ?? 60_000;
  const lastN = args.lastN ?? 100;
  const sinceIso = new Date(Date.now() - sinceMs).toISOString();
  const procName = args.process ?? "bun";

  // PowerShell: pull recent Application log entries with the process name in
  // the source or message. Best-effort; if the user runs as non-admin some
  // logs may be inaccessible.
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$start = [DateTime]::Parse("${sinceIso}")
Get-WinEvent -FilterHashtable @{ LogName='Application'; StartTime=$start } -ErrorAction SilentlyContinue |
  Where-Object { $_.ProviderName -match '${procName}' -or $_.Message -match '${procName}' } |
  Select-Object -First ${lastN} TimeCreated, LevelDisplayName, ProviderName, Message |
  ConvertTo-Json -Depth 3 -Compress
`.trim();

  const res = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", psScript], {
    encoding: "utf8",
    timeout: 15_000,
  });

  if (res.status !== 0 || !res.stdout) {
    return {
      entries: [],
      platform: "windows",
      warning: `Get-WinEvent returned no data (status=${res.status}). May need admin or filter adjustment.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    return { entries: [], platform: "windows", warning: "could not parse Get-WinEvent JSON output" };
  }

  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const entries: NativeLogEntry[] = rows.map((r: Record<string, unknown>) => ({
    ts: r.TimeCreated ? Date.parse(String(r.TimeCreated)) : Date.now(),
    level: String(r.LevelDisplayName ?? "info"),
    source: String(r.ProviderName ?? "unknown"),
    message: String(r.Message ?? "").trim(),
    providerName: r.ProviderName ? String(r.ProviderName) : undefined,
  }));

  return { entries, platform: "windows" };
}
