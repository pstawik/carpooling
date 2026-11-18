import { describe, expect, it } from "vitest";
import { buildSeatBalance } from "@/lib/services/drivers";

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
