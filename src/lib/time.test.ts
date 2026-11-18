import { describe, expect, it } from "vitest";
import { formatEventStart, utcToWarsawParts, warsawLocalToUtc } from "@/lib/time";

// Expected values are computed by hand from the Europe/Warsaw calendar: CET = UTC+1 in winter,
// CEST = UTC+2 in summer. In 2026 CEST starts Sun 29 Mar at 01:00Z (02:00 local jumps to 03:00)
// and ends Sun 25 Oct at 01:00Z (03:00 CEST goes back to 02:00 CET), so UTC = local - offset.
describe("warsawLocalToUtc", () => {
  it("winter: 2026-01-15 17:00 CET (+1) -> 17:00 - 1 h = 16:00Z", () => {
    expect(warsawLocalToUtc("2026-01-15", "17:00")?.toISOString()).toBe("2026-01-15T16:00:00.000Z");
  });

  it("summer: 2026-07-15 17:00 CEST (+2) -> 17:00 - 2 h = 15:00Z", () => {
    expect(warsawLocalToUtc("2026-07-15", "17:00")?.toISOString()).toBe("2026-07-15T15:00:00.000Z");
  });

  describe("spring forward, 2026-03-29", () => {
    it("01:59 is still CET (+1) -> 01:59 - 1 h = 00:59Z", () => {
      expect(warsawLocalToUtc("2026-03-29", "01:59")?.toISOString()).toBe("2026-03-29T00:59:00.000Z");
    });

    it("02:00 does not exist (02:00 jumps to 03:00) -> null", () => {
      expect(warsawLocalToUtc("2026-03-29", "02:00")).toBeNull();
    });

    it("02:30 does not exist (inside the 02:00-03:00 gap) -> null", () => {
      expect(warsawLocalToUtc("2026-03-29", "02:30")).toBeNull();
    });

    it("03:00 is the first CEST minute (+2) -> 03:00 - 2 h = 01:00Z", () => {
      expect(warsawLocalToUtc("2026-03-29", "03:00")?.toISOString()).toBe("2026-03-29T01:00:00.000Z");
    });
  });

  describe("fall back, 2026-10-25", () => {
    it("01:59 is still CEST (+2) -> 01:59 - 2 h = 23:59Z the previous day", () => {
      expect(warsawLocalToUtc("2026-10-25", "01:59")?.toISOString()).toBe("2026-10-24T23:59:00.000Z");
    });

    it("02:30 occurs twice (CEST 00:30Z, CET 01:30Z) -> the earlier, CEST (+2): 02:30 - 2 h = 00:30Z", () => {
      expect(warsawLocalToUtc("2026-10-25", "02:30")?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    });

    it("03:00 is CET again (+1) -> 03:00 - 1 h = 02:00Z", () => {
      expect(warsawLocalToUtc("2026-10-25", "03:00")?.toISOString()).toBe("2026-10-25T02:00:00.000Z");
    });
  });

  it("day boundary: 2026-01-01 00:30 CET (+1) -> 00:30 - 1 h = 23:30Z on 2025-12-31", () => {
    expect(warsawLocalToUtc("2026-01-01", "00:30")?.toISOString()).toBe("2025-12-31T23:30:00.000Z");
  });

  it("an impossible date (2026-02-30) -> null", () => {
    expect(warsawLocalToUtc("2026-02-30", "17:00")).toBeNull();
  });

  it("a date without zero padding (2026-1-05) -> null", () => {
    expect(warsawLocalToUtc("2026-1-05", "17:00")).toBeNull();
  });

  it("24:00 is not a valid time -> null", () => {
    expect(warsawLocalToUtc("2026-01-15", "24:00")).toBeNull();
  });
});

describe("utcToWarsawParts", () => {
  it("winter: 2026-01-15T16:00Z + 1 h (CET) = 2026-01-15 17:00", () => {
    expect(utcToWarsawParts("2026-01-15T16:00:00.000Z")).toEqual({ date: "2026-01-15", time: "17:00" });
  });

  it("summer: 2026-07-15T15:00Z + 2 h (CEST) = 2026-07-15 17:00", () => {
    expect(utcToWarsawParts("2026-07-15T15:00:00.000Z")).toEqual({ date: "2026-07-15", time: "17:00" });
  });
});

describe("formatEventStart", () => {
  it("2026-11-17T16:00Z + 1 h (CET) = Tuesday 17 November 2026, 17:00", () => {
    expect(formatEventStart("2026-11-17T16:00:00Z")).toBe("wtorek, 17 listopada 2026, 17:00");
  });
});
