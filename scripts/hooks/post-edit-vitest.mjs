// Claude Code PostToolUse hook: after Edit/Write of src/**/*.{ts,tsx}, run the related Vitest tests.
// stdin: hook JSON. Exit 0 = green or skipped, exit 2 = red tests (stderr is shown to the agent).
import { spawnSync } from "node:child_process";
import path from "node:path";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input = {};
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const filePath = input.tool_input?.file_path;
if (typeof filePath !== "string") process.exit(0);

const root = input.cwd ?? process.cwd();
const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join("/");
if (!/^src\/.*\.(ts|tsx)$/.test(rel)) process.exit(0);

const result = spawnSync("npx", ["vitest", "related", rel, "--run", "--passWithNoTests"], {
  cwd: root,
  encoding: "utf8",
  shell: true,
});

if (result.status === 0) process.exit(0);

const output = `${result.stdout ?? ""}${result.stderr ?? ""}${
  result.error
    ? `
spawn error: ${result.error.message}`
    : ""
}`.trim();
const tail = output.split("\n").slice(-40).join("\n");
process.stderr.write(`Vitest related to ${rel} is red:\n${tail}\n`);
process.exit(2);
