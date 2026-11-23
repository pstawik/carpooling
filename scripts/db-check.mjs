// Checks that every migration in supabase/migrations/ is already on the hosted Supabase project.
// Workers Builds deploys `main` immediately, so a migration missing there breaks production pages.
// Runs `supabase db push --linked --dry-run` with the local CLI login: nothing is written to the
// hosted database and no CI secret is needed.
//
//   npm run db:check          exit 0 up to date, 1 migrations pending, 2 could not check
//   node scripts/db-check.mjs --hook   (git pre-push) blocks only on pending migrations;
//                                      a failed check (offline, not logged in) only warns
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Reads the dry-run output, which is plain text in a terminal and JSON when stdout is not a TTY.
 * @param {string} output combined stdout and stderr
 * @returns {{ status: "up_to_date" } | { status: "pending", migrations: string[] } | { status: "unknown" }}
 */
export function classify(output) {
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const json = JSON.parse(trimmed);
      if (json.upToDate === true) return { status: "up_to_date" };
      if (Array.isArray(json.migrations) && json.migrations.length > 0) {
        return { status: "pending", migrations: json.migrations.map(String) };
      }
    } catch {
      // Not the JSON summary; fall through to the text format.
    }
  }
  if (output.includes("Remote database is up to date")) return { status: "up_to_date" };
  if (output.includes("Would push these migrations")) {
    const migrations = [...output.matchAll(/^\s*•\s*(\S+\.sql)\s*$/gm)].map((match) => match[1]);
    return { status: "pending", migrations };
  }
  return { status: "unknown" };
}

function main() {
  const hook = process.argv.includes("--hook");
  const couldNotCheck = (reason, details = "") => {
    console.error(`db:check: could not check the hosted database (${reason}).`);
    if (details) console.error(details.trim());
    if (hook) {
      console.error("db:check: push allowed; run `npm run db:check` once you can.");
      process.exit(0);
    }
    process.exit(2);
  };

  if (!fs.existsSync(path.join(REPO, "supabase", ".temp", "project-ref"))) {
    couldNotCheck("project not linked — run `npx supabase link`");
  }

  const result = spawnSync("npx supabase db push --linked --dry-run", {
    cwd: REPO,
    encoding: "utf8",
    shell: true,
    timeout: 120_000,
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const verdict = classify(output);

  if (verdict.status === "up_to_date") {
    console.log("db:check: hosted database has all migrations.");
    process.exit(0);
  }
  if (verdict.status === "pending") {
    console.error("db:check: the hosted database is missing these migrations:");
    for (const migration of verdict.migrations) console.error(`  • ${migration}`);
    console.error("Apply them with `npx supabase db push` (never with --include-seed), then push again.");
    if (hook) console.error("To push anyway (e.g. a branch for review only): git push --no-verify");
    process.exit(1);
  }
  couldNotCheck(result.error ? result.error.message : `supabase exited with ${result.status}`, output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
