import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { buildSeatBalance, driverWriteResult } from "@/lib/services/drivers";

// Expected values are computed by hand from the PRD "Bilans miejsc": the sum of the drivers' seats
// against the number of children declared as going; missing = going - seats when seats fall short.
describe("buildSeatBalance", () => {
  it("several drivers: 2 + 1 = 3 seats < 4 going -> 1 missing, shortage", () => {
    expect(buildSeatBalance([{ seats: 2 }, { seats: 1 }], 4)).toEqual({
      going: 4,
      seats: 3,
      missing: 1,
      status: "shortage",
    });
  });

  it("equality: 3 + 2 = 5 seats = 5 going -> 0 missing, enough", () => {
    expect(buildSeatBalance([{ seats: 3 }, { seats: 2 }], 5)).toEqual({
      going: 5,
      seats: 5,
      missing: 0,
      status: "enough",
    });
  });

  it("no drivers: 0 seats < 2 going -> 2 missing, shortage", () => {
    expect(buildSeatBalance([], 2)).toEqual({ going: 2, seats: 0, missing: 2, status: "shortage" });
  });

  it("nobody going: 4 seats, 0 going -> 0 missing, none_going", () => {
    expect(buildSeatBalance([{ seats: 4 }], 0)).toEqual({ going: 0, seats: 4, missing: 0, status: "none_going" });
  });

  it("maximum seats per driver (8): 8 + 8 = 16 seats < 17 going -> 1 missing, shortage", () => {
    expect(buildSeatBalance([{ seats: 8 }, { seats: 8 }], 17)).toEqual({
      going: 17,
      seats: 16,
      missing: 1,
      status: "shortage",
    });
  });
});

// A plain PostgREST error object, as the client returns it; no Supabase client is involved.
function pgError(code: string, message: string): PostgrestError {
  return { code, message, details: "", hint: "" } as unknown as PostgrestError;
}

// Code meanings: set_event_driver raises 42501 for an inaccessible or started event
// (20261113130000_create_event_drivers.sql:140,158); seats outside 1-8 break the check
// event_drivers_seats_range (20261113130000_create_event_drivers.sql:31) -> 23514.
describe("driverWriteResult", () => {
  it("no error -> ok", () => {
    expect(driverWriteResult(null)).toEqual({ ok: true });
  });

  it("42501 -> forbidden (RPC refused the event), error passed through", () => {
    const error = pgError("42501", "event not found or not accessible");
    const result = driverWriteResult(error);
    expect(result).toEqual({ ok: false, failure: "forbidden", error });
    expect(result.ok ? null : result.error).toBe(error);
  });

  it("23514 -> invalid_seats (event_drivers_seats_range), error passed through", () => {
    const error = pgError("23514", "new row violates check constraint");
    const result = driverWriteResult(error);
    expect(result).toEqual({ ok: false, failure: "invalid_seats", error });
    expect(result.ok ? null : result.error).toBe(error);
  });

  it("08006 (not in the list) -> unknown, never success or invalid_seats", () => {
    const error = pgError("08006", "connection failure");
    const result = driverWriteResult(error);
    expect(result).toEqual({ ok: false, failure: "unknown", error });
    expect(result.ok ? null : result.error).toBe(error);
  });
});
