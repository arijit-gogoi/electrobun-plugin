#!/usr/bin/env bun
/**
 * refresh-refs.ts
 *
 * Refresh the upstream pin recorded in skills/electrobun/refs/*.md frontmatter.
 *
 * Run before tagging any new plugin version that ships refreshed reference content.
 * The script does NOT regenerate the body of each ref file — that requires running
 * the live deepwiki/context7 MCPs which only an interactive Claude Code session has.
 *
 * What it DOES do (deterministically):
 *  1. Ensure `.cache/electrobun/` exists (bootstraps if missing) and pull main.
 *  2. Read the upstream HEAD SHA + electrobun package.json version.
 *  3. Update the frontmatter `upstream_sha`, `upstream_version`, `captured_at`
 *     fields in every `skills/electrobun/refs/**\/*.md` file.
 *  4. Print a checklist for the human/Claude:
 *       - which refs need manual content refresh (deepwiki overview, context7 cheatsheet)
 *       - any new playground / template that wasn't in the previous SHA → candidate for new example
 *
 * Usage:
 *   bun run scripts/refresh-refs.ts            # update frontmatter only
 *   bun run scripts/refresh-refs.ts --dry      # print what would change, don't write
 *   bun run scripts/refresh-refs.ts --pull     # also `git pull` the cache first
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot   = resolve(import.meta.dir, "..");
const cacheDir   = resolve(repoRoot, ".cache/electrobun");
const refsDir    = resolve(repoRoot, "skills/electrobun/refs");
const bootstrap  = process.platform === "win32"
  ? resolve(repoRoot, "scripts/bootstrap.ps1")
  : resolve(repoRoot, "scripts/bootstrap.sh");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry");
const doPull = args.has("--pull");

function run(cmd: string, opts: { cwd?: string } = {}): string {
  const parts = cmd.split(/\s+/);
  const res = spawnSync(parts[0], parts.slice(1), { cwd: opts.cwd ?? repoRoot, encoding: "utf8" });
  if (res.status !== 0) throw new Error(`command failed: ${cmd}\n${res.stderr}`);
  return res.stdout.trim();
}

function ensureClone() {
  if (existsSync(cacheDir)) return;
  console.log(`Cache missing → running bootstrap`);
  if (process.platform === "win32") {
    spawnSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", bootstrap], { stdio: "inherit" });
  } else {
    spawnSync("bash", [bootstrap], { stdio: "inherit" });
  }
}

function readUpstreamMeta(): { sha: string; version: string } {
  const sha = run(`git -C ${cacheDir} rev-parse HEAD`);
  const pkg = JSON.parse(readFileSync(join(cacheDir, "package/package.json"), "utf8"));
  return { sha, version: pkg.version };
}

function listMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listMarkdownFiles(full));
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

function updateFrontmatter(filePath: string, sha: string, version: string): boolean {
  const text = readFileSync(filePath, "utf8");
  if (!text.startsWith("---")) return false;

  const end = text.indexOf("\n---", 3);
  if (end === -1) return false;

  let header = text.slice(0, end + 4);
  const body = text.slice(end + 4);

  const today = new Date().toISOString().slice(0, 10);

  const replace = (re: RegExp, replacement: string) => {
    if (re.test(header)) header = header.replace(re, replacement);
  };

  replace(/^upstream_sha:.*$/m,     `upstream_sha: ${sha}`);
  replace(/^upstream_version:.*$/m, `upstream_version: ${version}`);
  replace(/^captured_at:.*$/m,      `captured_at: ${today}`);

  const next = header + body;
  if (next === text) return false;
  if (!dryRun) writeFileSync(filePath, next, "utf8");
  return true;
}

function main() {
  ensureClone();
  if (doPull) {
    console.log("git pull --ff-only");
    run(`git -C ${cacheDir} pull --ff-only`);
  }

  const { sha, version } = readUpstreamMeta();
  console.log(`Upstream electrobun: ${version} @ ${sha}`);

  const files = listMarkdownFiles(refsDir);
  let touched = 0;
  for (const f of files) {
    if (updateFrontmatter(f, sha, version)) {
      console.log(`${dryRun ? "WOULD UPDATE" : "updated   "} ${relative(repoRoot, f)}`);
      touched++;
    }
  }

  console.log(`\n${touched} frontmatter(s) ${dryRun ? "would be " : ""}refreshed.`);

  console.log("\nNext manual steps (Claude or human):");
  console.log("  1. Re-run deepwiki MCP for fresh structure → update refs/deepwiki-overview.md body.");
  console.log("  2. Re-run context7 query-docs → update refs/context7-cheatsheet.md snippets.");
  console.log("  3. Check templates/ + kitchen/src/playgrounds/ for new examples since last SHA.");
  console.log("  4. Bump version in .claude-plugin/plugin.json and tag.");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
