import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { childWriteResult } from "@/lib/services/children";

// A plain PostgREST error object, as the client returns it; no Supabase client is involved.
function pgError(code: string, message: string): PostgrestError {
  return { code, message, details: "", hint: "" } as unknown as PostgrestError;
}

// Code meanings come from the RLS comment-contract on childWriteResult (children.ts): INSERT on
// someone else's child raises 42501, UPDATE/DELETE on it match 0 rows; 23505 is the unique index
// children_parent_name_unique (20261112140000_create_children.sql:26).
describe("childWriteResult", () => {
  it("no error, no rows argument (INSERT) -> ok", () => {
    expect(childWriteResult(null)).toEqual({ ok: true });
  });

  it("no error, one matched row (UPDATE/DELETE) -> ok", () => {
    expect(childWriteResult(null, [{ id: "child-1" }])).toEqual({ ok: true });
  });

  it("no error, [] (RLS matched 0 rows) -> child_not_found, never success", () => {
    expect(childWriteResult(null, [])).toEqual({ ok: false, failure: "child_not_found" });
  });

  it("no error, null rows -> child_not_found, never success", () => {
    expect(childWriteResult(null, null)).toEqual({ ok: false, failure: "child_not_found" });
  });

  it("42501 -> forbidden (RLS refused INSERT), error passed through", () => {
    const error = pgError("42501", "new row violates row-level security policy");
    const result = childWriteResult(error);
    expect(result).toEqual({ ok: false, failure: "forbidden", error });
    expect(result.ok ? null : result.error).toBe(error);
  });

  it("23505 -> duplicate_child (children_parent_name_unique), error passed through", () => {
    const error = pgError("23505", "duplicate key value violates unique constraint");
    const result = childWriteResult(error, []);
    expect(result).toEqual({ ok: false, failure: "duplicate_child", error });
    expect(result.ok ? null : result.error).toBe(error);
  });

  it("08006 (not in the list) -> unknown, never success or child_not_found", () => {
    const error = pgError("08006", "connection failure");
    const result = childWriteResult(error, []);
    expect(result).toEqual({ ok: false, failure: "unknown", error });
    expect(result.ok ? null : result.error).toBe(error);
  });

  it("error together with matched rows -> the error wins (unknown), not ok", () => {
    const error = pgError("08006", "connection failure");
    expect(childWriteResult(error, [{ id: "child-1" }])).toEqual({ ok: false, failure: "unknown", error });
  });
});
