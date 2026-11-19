// Proof for the agent hooks in .claude/settings.json (scripts/hooks/*.mjs).
// Each case pipes a hook payload into the real script and asserts exit code and output channel.
// The scripts run against throwaway git repos; ESLint, Vitest and astro are small stubs that fail on
// a marker (LINT_ERROR, TEST_RED, TYPE_ERROR, UI_LITERAL) so that git and the scripts stay real.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Each case spawns node and git several times; git worktree is slow on Windows.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const POST_EDIT = path.join(REPO, "scripts", "hooks", "post-edit.mjs");
const END_OF_TURN = path.join(REPO, "scripts", "hooks", "end-of-turn.mjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-hooks-"));
const registryDir = path.join(tmp, "tmpdir");
fs.mkdirSync(registryDir);
let counter = 0;

const SCAN = `
const fs = require("fs"), path = require("path");
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
const hit = (marker) => walk("src").filter((f) => fs.readFileSync(f, "utf8").includes(marker));
`;

function stub(root, pkg, bin, body) {
  const dir = path.join(root, "node_modules", pkg);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: pkg, bin: { [bin]: "bin.cjs" } }));
  fs.writeFileSync(path.join(dir, "bin.cjs"), `${SCAN}\n${body}`);
}

function installStubs(root) {
  stub(
    root,
    "eslint",
    "eslint",
    `const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const bad = files.filter((f) => fs.existsSync(f) && fs.readFileSync(f, "utf8").includes("LINT_ERROR"));
if (bad.length) { console.log(bad.map((f) => f + ": error no-unused-vars").join("\\n")); process.exit(1); }`,
  );
  stub(
    root,
    "vitest",
    "vitest",
    `const [mode, file] = process.argv.slice(2);
const bad = mode === "related" ? (fs.readFileSync(file, "utf8").includes("TEST_RED") ? [file] : []) : hit("TEST_RED");
if (bad.length) { console.log("FAIL " + bad.join(", ") + " expected 1 to be 2"); process.exit(1); }`,
  );
  stub(
    root,
    "astro",
    "astro",
    `const bad = hit("TYPE_ERROR");
if (bad.length) { console.log(bad[0] + ":1:1 - error ts(2322): Type string is not assignable"); process.exit(1); }`,
  );
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "scripts", "check-ui-literals.mjs"),
    `import fs from "node:fs";
import path from "node:path";
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : [];
const bad = walk("src").filter((f) => fs.readFileSync(f, "utf8").includes("UI_LITERAL"));
if (bad.length) { console.log("literal in " + bad[0]); process.exit(1); }
`,
  );
}

const git = (cwd, ...args) =>
  spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, encoding: "utf8" });

function makeRepo() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(tmp, "repo-")));
  git(root, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n");
  fs.writeFileSync(path.join(root, "README.md"), "# fixture\n");
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "clean.ts"), "export const ok = 1;\n");
  installStubs(root);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

const write = (root, rel, content) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};

function run(script, payload, { cwd, env = {} } = {}) {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const r = spawnSync(process.execPath, [script], {
    cwd,
    input,
    encoding: "utf8",
    env: { ...process.env, TMPDIR: registryDir, TEMP: registryDir, TMP: registryDir, ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const edit = (root, file, extra = {}) =>
  run(POST_EDIT, { cwd: root, tool_name: "Edit", tool_input: { file_path: file }, ...extra }, { cwd: root });
const stop = (root, extra = {}) =>
  run(END_OF_TURN, { cwd: root, hook_event_name: "Stop", session_id: `s${++counter}`, ...extra }, { cwd: root });

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("post-edit.mjs (PostToolUse)", () => {
  let root;
  beforeAll(() => {
    root = makeRepo();
  });

  it("blocks on a lint error and names the file on stderr", () => {
    const file = write(root, "src/lint-bad.ts", "const unused = 1; // LINT_ERROR\n");
    const r = edit(root, file);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("src/lint-bad.ts");
    expect(r.stderr).toContain("ESLint");
  });

  it("blocks on a red related test (behavioural failure)", () => {
    const file = write(root, "src/test-bad.ts", "export const v = 1; // TEST_RED\n");
    const r = edit(root, file);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Vitest tests related to src/test-bad.ts");
  });

  it("passes a clean file without output", () => {
    const r = edit(root, path.join(root, "src", "clean.ts"));
    expect(r).toMatchObject({ code: 0, stderr: "" });
  });

  it("skips a file type the check does not cover", () => {
    const file = write(root, "README.md", "LINT_ERROR TEST_RED\n");
    expect(edit(root, file).code).toBe(0);
  });

  it("passes when the file does not exist", () => {
    expect(edit(root, path.join(root, "src", "missing.ts")).code).toBe(0);
  });

  it.each([["{}"], ["not json"], [""], ['{"tool_input":{}}'], ['{"tool_input":{"file_path":42}}'], ["null"]])(
    "passes on an empty or path-less payload %j",
    (payload) => {
      expect(run(POST_EDIT, payload, { cwd: root }).code).toBe(0);
    },
  );

  it("resolves a relative path against the payload cwd", () => {
    write(root, "src/rel-bad.ts", "// LINT_ERROR\n");
    const r = run(POST_EDIT, { cwd: root, tool_input: { file_path: "src/rel-bad.ts" } }, { cwd: os.tmpdir() });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("src/rel-bad.ts");
  });

  it("checks the session checkout even when CLAUDE_PROJECT_DIR points at another one with an error", () => {
    const other = makeRepo();
    write(other, "src/clean.ts", "// LINT_ERROR TEST_RED\n");
    const r = run(
      POST_EDIT,
      { cwd: root, tool_input: { file_path: path.join(root, "src", "clean.ts") } },
      { cwd: root, env: { CLAUDE_PROJECT_DIR: other } },
    );
    expect(r.code).toBe(0);
  });

  it("skips a broken file that belongs to another repository", () => {
    const other = makeRepo();
    const file = write(other, "src/foreign.ts", "// LINT_ERROR\n");
    expect(edit(root, file).code).toBe(0);
  });

  it("fails visibly when ESLint is not installed", () => {
    const bare = makeRepo();
    fs.rmSync(path.join(bare, "node_modules", "eslint"), { recursive: true });
    const r = edit(bare, path.join(bare, "src", "clean.ts"));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("eslint is not installed");
  });
});

describe("end-of-turn.mjs (Stop)", () => {
  it("passes without running a check when nothing changed", () => {
    const root = makeRepo();
    // A broken tool would show up as a failure: remove it, a quiet turn must not need it.
    fs.rmSync(path.join(root, "node_modules", "eslint"), { recursive: true });
    expect(stop(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("blocks on a lint error written directly to disk (edit that bypassed the per-edit hook)", () => {
    const root = makeRepo();
    write(root, "src/shell-written.ts", "// LINT_ERROR\n");
    const r = stop(root);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("ESLint errors in changed files");
    expect(r.stderr).toContain("src/shell-written.ts");
  });

  it("blocks on a red unit test in a module that was only imported (whole suite)", () => {
    const root = makeRepo();
    write(root, "src/other.ts", "// TEST_RED\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "red");
    write(root, "src/clean.ts", "export const ok = 2;\n");
    const r = stop(root);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Unit tests fail");
  });

  it("blocks on a type error (astro check) and on a UI literal", () => {
    const root = makeRepo();
    write(root, "src/typed.ts", "// TYPE_ERROR UI_LITERAL\n");
    const r = stop(root);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("astro check failed");
    expect(r.stderr).toContain("check-ui-literals failed");
  });

  it("passes a clean change", () => {
    const root = makeRepo();
    write(root, "src/clean.ts", "export const ok = 2;\n");
    expect(stop(root)).toMatchObject({ code: 0, stderr: "" });
  });

  it("passes with a changed file the checks do not cover", () => {
    const root = makeRepo();
    write(root, "README.md", "LINT_ERROR TEST_RED TYPE_ERROR\n");
    expect(stop(root).code).toBe(0);
  });

  it("lets the agent finish when stop_hook_active is set, even with an error present", () => {
    const root = makeRepo();
    write(root, "src/bad.ts", "// LINT_ERROR\n");
    expect(stop(root, { stop_hook_active: true }).code).toBe(0);
    expect(stop(root, { loop_count: 1 }).code).toBe(0);
  });

  it.each([["{}"], ["not json"], [""]])("does not crash on payload %j", (payload) => {
    const root = makeRepo();
    expect(run(END_OF_TURN, payload, { cwd: root }).code).toBe(0);
  });

  it("says so when there is no git checkout", () => {
    const dir = fs.mkdtempSync(path.join(tmp, "nogit-"));
    const r = run(END_OF_TURN, { cwd: dir }, { cwd: dir, env: { GIT_CEILING_DIRECTORIES: tmp } });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("nothing checked");
  });

  it("checks the session checkout, not CLAUDE_PROJECT_DIR", () => {
    const root = makeRepo();
    const other = makeRepo();
    write(other, "src/bad.ts", "// LINT_ERROR\n");
    const r = run(END_OF_TURN, { cwd: root, session_id: "env" }, { cwd: root, env: { CLAUDE_PROJECT_DIR: other } });
    expect(r.code).toBe(0);
  });

  it("sweeps a sibling worktree that the per-edit hook saw", () => {
    const root = makeRepo();
    const sibling = `${root}-wt`;
    git(root, "worktree", "add", "-q", "-b", "wt", sibling);
    installStubs(sibling);
    const sid = "sibling";
    const file = write(sibling, "src/b.ts", "// LINT_ERROR\n");
    const first = run(POST_EDIT, { cwd: root, session_id: sid, tool_input: { file_path: file } }, { cwd: root });
    expect(first.code).toBe(2);
    const r = run(END_OF_TURN, { cwd: root, session_id: sid }, { cwd: root });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(fs.realpathSync.native(sibling));
    expect(r.stderr).toContain("src/b.ts");
  });
});

describe(".claude/settings.json commands", () => {
  const settings = JSON.parse(fs.readFileSync(path.join(REPO, ".claude", "settings.json"), "utf8"));
  const commands = Object.entries(settings.hooks).flatMap(([event, groups]) =>
    groups.flatMap((g) => g.hooks.map((h) => ({ event, command: h.command, timeout: h.timeout }))),
  );

  it("registers a per-edit and an end-of-turn hook with timeouts in seconds", () => {
    expect(commands.map((c) => c.event).sort()).toEqual(["PostToolUse", "Stop"]);
    for (const c of commands) expect(c.timeout).toBeLessThanOrEqual(600);
  });

  it.each(commands)(
    "$event command reaches an executable script with a stale CLAUDE_PROJECT_DIR",
    ({ event, command }) => {
      const payload = event === "Stop" ? { stop_hook_active: true } : {};
      const r = spawnSync("bash", ["-c", command], {
        cwd: REPO,
        input: JSON.stringify(payload),
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: path.join(tmp, "does-not-exist") },
      });
      expect(r.error).toBeUndefined();
      expect({ code: r.status, stderr: r.stderr }).toEqual({ code: 0, stderr: "" });
    },
  );
});
