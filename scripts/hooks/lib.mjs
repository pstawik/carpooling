// Shared helpers for the Claude Code agent hooks (post-edit.mjs, end-of-turn.mjs).
// Tools run through `node <bin>` straight from the checkout's node_modules: no shell, no npx lookup,
// and a missing tool is reported as a failure instead of passing silently.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

export async function readPayload() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env });
  return r.status === 0 ? r.stdout : null;
}

export const real = (p) => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return null;
  }
};

export const toplevel = (dir) => {
  const out = git(dir, ["rev-parse", "--show-toplevel"]);
  return out ? real(out.trim()) : null;
};

export const commonDir = (dir) => {
  const out = git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  return out ? real(out.trim()) : null;
};

export const sessionId = (input) => String(input.session_id ?? "").replace(/[^A-Za-z0-9_-]/g, "");

// Checkouts touched by the per-edit hook, so the end-of-turn hook also sweeps sibling worktrees.
export const registryFile = (sid) => path.join(os.tmpdir(), "claude-hooks", `${sid || "none"}.roots`);

function binPath(root, pkg, bin) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "node_modules", pkg, "package.json"), "utf8"));
    const rel = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[bin];
    return rel ? path.join(root, "node_modules", pkg, rel) : null;
  } catch {
    return null;
  }
}

export function runNode(root, file, args) {
  const r = spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? `\nspawn error: ${r.error.message}` : ""}`.trim();
  return { ok: r.status === 0 && !r.error, output };
}

// Runs a locally installed CLI. ok=false when it exits non-zero, cannot start or is not installed.
export function runTool(root, pkg, bin, args) {
  const file = binPath(root, pkg, bin);
  if (!file) return { ok: false, output: `${pkg} is not installed in ${root}/node_modules (run npm ci).` };
  return runNode(root, file, args);
}

export const tail = (text, n = 60) => text.split("\n").slice(-n).join("\n");
