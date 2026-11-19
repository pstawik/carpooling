import { describe, expect, it } from "vitest";
import { warsawLocalToUtc } from "@/lib/time";
import { MAX_SERIES_DAYS, weeklyDates } from "@/lib/weekly-events";

const MONDAY = 1;
const SUNDAY = 7;

// Expected dates come from the 2026 calendar (2026-03-23 is a Monday, 2026-10-18 a Sunday); the
// UTC instants from the Europe/Warsaw rules: CET = UTC+1, CEST = UTC+2, with CEST from Sun 29 Mar
// and CET again from Sun 25 Oct 2026. A 17:00 event is 16:00Z in CET and 15:00Z in CEST.
describe("weeklyDates", () => {
  it("Mondays across spring forward: 23 Mar (CET), 30 Mar and 6 Apr (CEST), no day lost or shifted", () => {
    const dates = weeklyDates("2026-03-23", "2026-04-06", MONDAY);
    expect(dates).toEqual(["2026-03-23", "2026-03-30", "2026-04-06"]);
    // 17:00 - 1 h (CET) = 16:00Z; 17:00 - 2 h (CEST) = 15:00Z, twice.
    expect(dates.map((date) => warsawLocalToUtc(date, "17:00")?.toISOString())).toEqual([
      "2026-03-23T16:00:00.000Z",
      "2026-03-30T15:00:00.000Z",
      "2026-04-06T15:00:00.000Z",
    ]);
  });

  it("Sundays across fall back: 18 Oct (CEST), 25 Oct and 1 Nov (CET), no day lost or shifted", () => {
    const dates = weeklyDates("2026-10-18", "2026-11-01", SUNDAY);
    expect(dates).toEqual(["2026-10-18", "2026-10-25", "2026-11-01"]);
    // 17:00 - 2 h (CEST) = 15:00Z; 17:00 - 1 h (CET, already in force at 17:00 on 25 Oct) = 16:00Z, twice.
    expect(dates.map((date) => warsawLocalToUtc(date, "17:00")?.toISOString())).toEqual([
      "2026-10-18T15:00:00.000Z",
      "2026-10-25T16:00:00.000Z",
      "2026-11-01T16:00:00.000Z",
    ]);
  });

  it("from on a Wednesday (2026-03-25): the series starts on the next Monday, 2026-03-30", () => {
    expect(weeklyDates("2026-03-25", "2026-04-08", MONDAY)).toEqual(["2026-03-30", "2026-04-06"]);
  });

  it("a reversed range -> []", () => {
    expect(weeklyDates("2026-04-06", "2026-03-23", MONDAY)).toEqual([]);
  });

  it(`a range longer than MAX_SERIES_DAYS (${MAX_SERIES_DAYS}): 2026-01-01 to 2027-01-03 is 367 days -> []`, () => {
    expect(weeklyDates("2026-01-01", "2027-01-03", MONDAY)).toEqual([]);
  });

  // weekly-event-generator F1: the attack input yields 0 dates, no CPU loop
  // (context/archive/2026-11-13-weekly-event-generator/reviews/impl-review.md:40).
  it("an unparsable end (99999-0x1-01) -> [] (F1)", () => {
    expect(weeklyDates("2026-01-01", "99999-0x1-01", MONDAY)).toEqual([]);
  });
});
