// Claude Code Stop hook: lint changed files and run the UI literal guard before the turn ends.
// stdin: hook JSON. Exit 0 = clean (or re-entry), exit 2 = errors (stderr blocks the stop).
import { spawnSync } from "node:child_process";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input = {};
try {
  input = JSON.parse(raw);
} catch {
  // no usable payload: run the checks anyway
}

if (input.stop_hook_active === true) process.exit(0);

const root = input.cwd ?? process.cwd();
const run = (cmd, args, shell = false) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", shell });
const lines = (r) =>
  r.status === 0
    ? r.stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

const changed = new Set([
  ...lines(run("git", ["diff", "--name-only", "--diff-filter=d", "HEAD"])),
  ...lines(run("git", ["ls-files", "--others", "--exclude-standard"])),
]);
const files = [...changed].filter((f) => /\.(ts|tsx|astro|mjs)$/.test(f) && !f.startsWith(".claude/"));

const failures = [];

if (files.length > 0) {
  const lint = run("npx", ["eslint", ...files.map((f) => `"${f}"`)], true);
  if (lint.status !== 0) failures.push(`eslint failed:\n${`${lint.stdout}${lint.stderr}`.trim()}`);
}

const ui = run("node", ["scripts/check-ui-literals.mjs"]);
if (ui.status !== 0) failures.push(`check-ui-literals failed:\n${`${ui.stdout}${ui.stderr}`.trim()}`);

if (failures.length === 0) process.exit(0);
process.stderr.write(`${failures.join("\n\n")}\n`);
process.exit(2);
