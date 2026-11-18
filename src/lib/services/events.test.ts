import { describe, expect, it } from "vitest";
import { type GroupEventItem, hasStarted } from "@/lib/services/events";

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
