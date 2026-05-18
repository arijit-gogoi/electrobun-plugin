#!/usr/bin/env bun
// Bundle src/mcp/index.ts → dist/mcp/index.js for shipping with the plugin.
// V18: bundled artifact committed; users get it via marketplace install,
// no rebuild required on their side.

import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const entry = resolve(repoRoot, "src/mcp/index.ts");
const outdir = resolve(repoRoot, "dist/mcp");

const result = await Bun.build({
  entrypoints: [entry],
  outdir,
  target: "bun",
  format: "esm",
  splitting: false,
  minify: false,
  sourcemap: "none",
  external: [
    // No external deps at runtime — bundle everything except Node built-ins
    // (bun handles those natively).
  ],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${result.outputs.length} artifact(s) → ${outdir}/`);
for (const out of result.outputs) {
  console.log(`  ${out.path}`);
}
