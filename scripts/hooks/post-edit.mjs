// Claude Code PostToolUse hook (Write|Edit): check the one file the agent just edited.
// ESLint on that file; for src/**/*.{ts,tsx} also the Vitest tests related to it.
// stdin: hook JSON. Exit 0 = clean or nothing to check; exit 2 = stderr goes to the agent.
import fs from "node:fs";
import path from "node:path";
import { commonDir, readPayload, real, registryFile, runTool, sessionId, tail, toplevel } from "./lib.mjs";

const input = await readPayload();
const sessionCwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
const given = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
if (typeof given !== "string" || given === "") process.exit(0);

const file = path.resolve(sessionCwd, given);
if (!/\.(ts|tsx|astro|mjs)$/.test(file) || !fs.existsSync(file)) process.exit(0);

// Checkout of the edited file, not $CLAUDE_PROJECT_DIR; files of other repositories are skipped.
const root = toplevel(path.dirname(file));
if (!root) process.exit(0);
const sessionRepo = commonDir(sessionCwd);
if (!sessionRepo || sessionRepo !== commonDir(root)) process.exit(0);

const sid = sessionId(input);
if (sid) {
  try {
    const registry = registryFile(sid);
    fs.mkdirSync(path.dirname(registry), { recursive: true });
    fs.appendFileSync(registry, `${root}\n`);
  } catch {
    // best effort: only the sweep of sibling worktrees depends on it
  }
}

const rel = path
  .relative(root, real(file) ?? file)
  .split(path.sep)
  .join("/");
const failures = [];

const lint = runTool(root, "eslint", "eslint", ["--quiet", rel]);
if (!lint.ok) failures.push(`ESLint reported errors in ${rel}:\n${tail(lint.output)}`);

if (/^src\/.*\.(ts|tsx)$/.test(rel)) {
  const tests = runTool(root, "vitest", "vitest", ["related", rel, "--run", "--passWithNoTests"]);
  if (!tests.ok) failures.push(`Vitest tests related to ${rel} fail:\n${tail(tests.output)}`);
}

if (failures.length === 0) process.exit(0);
process.stderr.write(`${failures.join("\n\n")}\n`);
process.exit(2);
