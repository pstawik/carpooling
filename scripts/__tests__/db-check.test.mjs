// Parsing of `supabase db push --linked --dry-run` output in both formats the CLI prints
// (text in a terminal, a JSON summary when stdout is not a TTY). Outputs copied from CLI 2.122.0.
import { describe, expect, it } from "vitest";
import { classify } from "../db-check.mjs";

const TEXT_PENDING = `Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20261113130000_create_event_drivers.sql
 • 20261116120000_lock_child_delete_with_history.sql
`;

const JSON_PENDING = `Initialising login role...
{"upToDate":false,"dryRun":true,"migrations":["20261113130000_create_event_drivers.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
`;

describe("classify", () => {
  it("reads an up-to-date text output", () => {
    expect(classify("Connecting to remote database...\nRemote database is up to date.\n")).toEqual({
      status: "up_to_date",
    });
  });

  it("reads an up-to-date JSON output", () => {
    const output = `{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],"message":"Remote database is up to date."}`;
    expect(classify(output)).toEqual({ status: "up_to_date" });
  });

  it("lists pending migrations from text output", () => {
    expect(classify(TEXT_PENDING)).toEqual({
      status: "pending",
      migrations: ["20261113130000_create_event_drivers.sql", "20261116120000_lock_child_delete_with_history.sql"],
    });
  });

  it("lists pending migrations from JSON output", () => {
    expect(classify(JSON_PENDING)).toEqual({
      status: "pending",
      migrations: ["20261113130000_create_event_drivers.sql"],
    });
  });

  it("treats errors (not logged in, offline, remote-only versions) as unknown", () => {
    expect(classify("Access token not provided. Supply an access token by running supabase login")).toEqual({
      status: "unknown",
    });
    expect(classify("Remote migration versions not found in local migrations directory.")).toEqual({
      status: "unknown",
    });
  });
});
