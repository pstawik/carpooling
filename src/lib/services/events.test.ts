import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { eventWriteResult, type GroupEventItem, hasStarted } from "@/lib/services/events";

// A plain PostgREST error object, as the client returns it; no Supabase client is involved.
function pgError(code: string, message: string): PostgrestError {
  return { code, message, details: "", hint: "" } as unknown as PostgrestError;
}

// The database locks declarations with `starts_at <= now()`, so an event has started from its start
// instant inclusive; one millisecond earlier it is still open.
const event: GroupEventItem = {
  id: "00000000-0000-4000-8000-000000000001",
  startsAt: "2026-11-17T16:00:00.000Z",
  note: null,
};
const startMs = Date.parse(event.startsAt);

describe("hasStarted", () => {
  it("now = start -> started (starts_at <= now)", () => {
    expect(hasStarted(event, new Date(startMs))).toBe(true);
  });

  it("now = start - 1 ms -> not started", () => {
    expect(hasStarted(event, new Date(startMs - 1))).toBe(false);
  });

  it("now = start + 1 ms -> started", () => {
    expect(hasStarted(event, new Date(startMs + 1))).toBe(true);
  });
});

// Code meanings come from the RLS comment-contract on eventWriteResult (events.ts): a refused INSERT
// or an UPDATE to a non-future start raises 42501, UPDATE/DELETE the caller may not write match 0
// rows; 23505 is the unique index events_group_starts_at_unique (20261112150000_create_events.sql:32).
describe("eventWriteResult", () => {
  it("no error, no rows argument (INSERT) -> ok", () => {
    expect(eventWriteResult(null)).toEqual({ ok: true });
  });

  it("no error, one matched row (UPDATE/DELETE) -> ok", () => {
    expect(eventWriteResult(null, [{ id: "event-1" }])).toEqual({ ok: true });
  });

  it("no error, [] (RLS matched 0 rows) -> event_not_found, never success", () => {
    expect(eventWriteResult(null, [])).toEqual({ ok: false, failure: "event_not_found" });
  });

  it("no error, null rows -> event_not_found, never success", () => {
    expect(eventWriteResult(null, null)).toEqual({ ok: false, failure: "event_not_found" });
  });

  it("42501 -> forbidden (RLS refused INSERT / non-future start), error passed through", () => {
    const error = pgError("42501", "new row violates row-level security policy");
    const result = eventWriteResult(error);
    expect(result).toEqual({ ok: false, failure: "forbidden", error });
    expect(result.ok ? null : result.error).toBe(error);
  });

  it("23505 -> duplicate_event (events_group_starts_at_unique), error passed through", () => {
    const error = pgError("23505", "duplicate key value violates unique constraint");
    const result = eventWriteResult(error, []);
    expect(result).toEqual({ ok: false, failure: "duplicate_event", error });
    expect(result.ok ? null : result.error).toBe(error);
  });

  it("08006 (not in the list) -> unknown, never success or event_not_found", () => {
    const error = pgError("08006", "connection failure");
    const result = eventWriteResult(error, []);
    expect(result).toEqual({ ok: false, failure: "unknown", error });
    expect(result.ok ? null : result.error).toBe(error);
  });

  it("error together with matched rows -> the error wins (unknown), not ok", () => {
    const error = pgError("08006", "connection failure");
    expect(eventWriteResult(error, [{ id: "event-1" }])).toEqual({ ok: false, failure: "unknown", error });
  });
});
