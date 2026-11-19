import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addEventSchema,
  eventFieldError,
  eventSeriesFieldError,
  generateEventsSchema,
  updateEventSchema,
} from "@/lib/validation/events";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";

// "Now" is frozen at 2026-11-19 12:00:00Z = 13:00 in Warsaw (CET, UTC+1 in November).
describe("addEventSchema", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function fieldError(input: Record<string, unknown>) {
    const result = addEventSchema.safeParse(input);
    expect(result.success).toBe(false);
    return result.success ? null : eventFieldError(input, result.error.issues);
  }

  // Years: group-admin-manages-events F1 — 9999-12-31 23:00 is a valid instant, 0999/0000 give
  // null, never a RangeError (context/archive/2026-11-12-group-admin-manages-events/reviews/impl-review.md:36).
  it("9999-12-31 23:00 -> success, 23:00 - 1 h (CET) = 9999-12-31T22:00:00.000Z (F1: no RangeError)", () => {
    const input = { group_id: GROUP_ID, date: "9999-12-31", time: "23:00" };
    let result: ReturnType<typeof addEventSchema.safeParse> | undefined;
    expect(() => {
      result = addEventSchema.safeParse(input);
    }).not.toThrow();
    expect(result?.success && result.data.startsAt).toBe("9999-12-31T22:00:00.000Z");
  });

  it.each(["0999-06-01", "0000-01-01"])("%s -> failure, invalid_event_start, no throw (F1)", (date) => {
    const input = { group_id: GROUP_ID, date, time: "17:00" };
    expect(() => addEventSchema.safeParse(input)).not.toThrow();
    expect(fieldError(input)).toEqual({ groupId: GROUP_ID, code: "invalid_event_start" });
  });

  // Margin: start must be more than 60 s ahead, strict > (validation/events.ts:26-30 contract comment;
  // group-admin-manages-events F3, context/archive/2026-11-12-group-admin-manages-events/reviews/impl-review.md:56).
  it("13:01 Warsaw = 12:01:00Z = exactly now + 60 s -> invalid_event_start (strict >)", () => {
    expect(fieldError({ group_id: GROUP_ID, date: "2026-11-19", time: "13:01" })).toEqual({
      groupId: GROUP_ID,
      code: "invalid_event_start",
    });
  });

  it("13:02 Warsaw = 12:02:00Z = now + 120 s -> success", () => {
    const result = addEventSchema.safeParse({ group_id: GROUP_ID, date: "2026-11-19", time: "13:02" });
    expect(result.success && result.data.startsAt).toBe("2026-11-19T12:02:00.000Z");
  });

  // events_note_length: null or 1–200 after trim (20261112150000_create_events.sql:23).
  it("200-character note -> success (events_note_length <= 200)", () => {
    const note = "a".repeat(200);
    const result = addEventSchema.safeParse({ group_id: GROUP_ID, date: "2026-12-01", time: "17:00", note });
    expect(result.success && result.data.note).toBe(note);
  });

  it("201-character note -> invalid_event_note (events_note_length <= 200)", () => {
    expect(fieldError({ group_id: GROUP_ID, date: "2026-12-01", time: "17:00", note: "a".repeat(201) })).toEqual({
      groupId: GROUP_ID,
      code: "invalid_event_note",
    });
  });

  // group-admin-manages-events F2: a start error wins over a note error
  // (context/archive/2026-11-12-group-admin-manages-events/reviews/impl-review.md:46).
  it("past start + 201-character note -> invalid_event_start (start wins, F2)", () => {
    expect(fieldError({ group_id: GROUP_ID, date: "2026-11-18", time: "17:00", note: "a".repeat(201) })).toEqual({
      groupId: GROUP_ID,
      code: "invalid_event_start",
    });
  });
});

// A malformed hidden id means a tampered form: null, which the endpoint answers with 404.
describe("eventFieldError", () => {
  it("malformed group_id -> null (404)", () => {
    const input = { group_id: "not-a-uuid", date: "2999-01-01", time: "17:00" };
    const result = addEventSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.success ? "parsed" : eventFieldError(input, result.error.issues)).toBeNull();
  });

  it("malformed event_id -> null (404)", () => {
    const input = { group_id: GROUP_ID, event_id: "not-a-uuid", date: "2999-01-01", time: "17:00" };
    const result = updateEventSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.success ? "parsed" : eventFieldError(input, result.error.issues)).toBeNull();
  });
});

// MAX_SERIES_DAYS oracle: the range spans at most 366 days, both ends included
// (weekly-event-generator plan; 2026 has 365 days, so 2026-01-01 + 366 days = 2027-01-02).
describe("generateEventsSchema", () => {
  const BASE = { group_id: GROUP_ID, weekday: "1", time: "17:00" };

  function seriesError(input: Record<string, unknown>) {
    const result = generateEventsSchema.safeParse(input);
    expect(result.success).toBe(false);
    return result.success ? null : eventSeriesFieldError(input, result.error.issues);
  }

  // weekly-event-generator F1: the attack input yields 0 dates in ~0 ms, and the range checks run
  // only on well-formed dates (context/archive/2026-11-13-weekly-event-generator/reviews/impl-review.md:40).
  it("date_to = 99999-0x1-01 -> failure in < 100 ms, only date_to reported, invalid_event_series (F1)", () => {
    const input = { ...BASE, date_from: "2026-01-01", date_to: "99999-0x1-01" };
    const started = performance.now();
    const result = generateEventsSchema.safeParse(input);
    const elapsedMs = performance.now() - started;
    expect(elapsedMs).toBeLessThan(100);
    expect(result.success).toBe(false);
    // The gated range check never ran, so the malformed field is the only one reported (no weekday issue).
    expect(result.success ? [] : [...new Set(result.error.issues.map((issue) => issue.path[0]))]).toEqual(["date_to"]);
    expect(result.success ? null : eventSeriesFieldError(input, result.error.issues)).toEqual({
      groupId: GROUP_ID,
      code: "invalid_event_series",
    });
  });

  it("2026-01-01 to 2027-01-02 (366 days) -> success", () => {
    expect(generateEventsSchema.safeParse({ ...BASE, date_from: "2026-01-01", date_to: "2027-01-02" }).success).toBe(
      true,
    );
  });

  it("2026-01-01 to 2027-01-03 (367 days) -> invalid_event_series", () => {
    expect(seriesError({ ...BASE, date_from: "2026-01-01", date_to: "2027-01-03" })).toEqual({
      groupId: GROUP_ID,
      code: "invalid_event_series",
    });
  });

  it("2026-02-30 (not a calendar day) -> invalid_event_series", () => {
    expect(seriesError({ ...BASE, date_from: "2026-02-30", date_to: "2026-03-30" })).toEqual({
      groupId: GROUP_ID,
      code: "invalid_event_series",
    });
  });

  it("malformed group_id -> null (404)", () => {
    expect(seriesError({ ...BASE, group_id: "not-a-uuid", date_from: "2026-01-01", date_to: "2026-02-01" })).toBeNull();
  });
});
