// Claude Code Stop hook: sweep everything this turn changed, one retry.
// Per checkout with changes: ESLint on changed files, check-ui-literals, the whole Vitest suite
// and `astro check`. Catches edits made through shell commands, which never reach post-edit.mjs.
// stdin: hook JSON. Exit 0 = clean, nothing changed or retry; exit 2 = stderr keeps the agent working.
import fs from "node:fs";
import path from "node:path";
import { git, readPayload, real, registryFile, runNode, runTool, sessionId, tail, toplevel } from "./lib.mjs";

const input = await readPayload();

// Already sent back once by this hook: let the turn finish. The commit gate and CI catch the rest.
if (input.stop_hook_active === true || (Number(input.loop_count) || 0) > 0) process.exit(0);

const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
const sid = sessionId(input);
const registry = registryFile(sid);

const roots = new Set();
const top = toplevel(cwd);
if (top) roots.add(top);
if (sid) {
  try {
    for (const line of fs.readFileSync(registry, "utf8").split("\n")) {
      const dir = line.trim() && real(line.trim());
      if (dir) roots.add(dir);
    }
  } catch {
    // no registry: only the session checkout
  }
}

if (roots.size === 0) {
  const systemMessage = `end-of-turn.mjs: no git checkout at ${cwd}, nothing checked.`;
  process.stdout.write(`${JSON.stringify({ systemMessage })}\n`);
  process.exit(0);
}

const list = (root, args) => {
  const out = git(root, args);
  return out === null ? null : out.split("\0").filter(Boolean);
};

const report = [];
for (const root of roots) {
  const tracked = list(root, ["diff", "--name-only", "-z", "--diff-filter=d", "HEAD"]);
  const untracked = list(root, ["ls-files", "-z", "--others", "--exclude-standard"]);
  if (tracked === null || untracked === null) {
    report.push(`git failed in ${root}, the changed files could not be listed.`);
    continue;
  }
  const covered = [...new Set([...tracked, ...untracked])].filter(
    (f) => /\.(ts|tsx|astro|mjs)$/.test(f) && !f.startsWith(".claude/") && fs.existsSync(path.join(root, f)),
  );
  if (covered.length === 0) continue;

  const checks = [
    ["ESLint errors in changed files", runTool(root, "eslint", "eslint", ["--quiet", ...covered])],
    ["check-ui-literals failed", runNode(root, path.join(root, "scripts", "check-ui-literals.mjs"), [])],
    ["Unit tests fail", runTool(root, "vitest", "vitest", ["run", "src"])],
  ];
  if (covered.some((f) => /\.(ts|tsx|astro)$/.test(f))) {
    checks.push(["astro check failed", runTool(root, "astro", "astro", ["check"])]);
  }
  for (const [title, result] of checks) {
    if (!result.ok) report.push(`${title} (${root}):\n${tail(result.output)}`);
  }
}

if (report.length > 0) {
  process.stderr.write(`Fix these before you finish:\n\n${report.join("\n\n")}\n`);
  process.exit(2);
}

// Green: start the next turn with an empty registry.
if (sid) {
  try {
    fs.writeFileSync(registry, "");
  } catch {
    // best effort
  }
}
process.exit(0);
