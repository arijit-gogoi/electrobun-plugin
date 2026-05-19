#!/usr/bin/env bun
// Pre-tag gate. Order: cheap → expensive.
//   1. `claude plugin validate` — catches manifest schema drift (B2-class bugs).
//   2. `bun tsc --noEmit`       — type-check src/mcp + packages/electrobun-devtools.
//   3. `bun run build:mcp`      — bundle dist/mcp/index.js so V18 commit is current.
// Exits 0 only if all three green. Exit on first failure.

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type Step = { name: string; cmd: string; args: string[] };

const steps: Step[] = [
  { name: "manifest", cmd: "claude", args: ["plugin", "validate", root] },
  { name: "typecheck", cmd: "bun", args: ["tsc", "--noEmit"] },
  { name: "build:mcp", cmd: "bun", args: ["run", "scripts/build-mcp.ts"] },
];

for (const step of steps) {
  console.error(`\n→ verify[${step.name}]: ${step.cmd} ${step.args.join(" ")}`);
  const r = spawnSync(step.cmd, step.args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    console.error(`\n✗ verify[${step.name}] failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}

console.error("\n✓ verify: all green. safe to tag.");
