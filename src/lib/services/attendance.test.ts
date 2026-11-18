import { describe, expect, it } from "vitest";
import { buildChildPlan } from "@/lib/services/attendance";
import type { GroupChild } from "@/lib/services/children";
import { buildSeatBalance } from "@/lib/services/drivers";

const ME = "parent-me";
const OTHER = "parent-other";

const ala: GroupChild = { id: "child-ala", name: "Ala", parentId: OTHER, parentNick: "Basia" };
const kuba: GroupChild = { id: "child-kuba", name: "Kuba", parentId: OTHER, parentNick: "Basia" };
const ola: GroupChild = { id: "child-ola", name: "Ola", parentId: ME, parentNick: "Tata Oli" };
const zosia: GroupChild = { id: "child-zosia", name: "Zosia", parentId: ME, parentNick: "Tata Oli" };

const children = [ala, kuba, ola, zosia];
// Zosia has no entry: no declaration.
const attendance = new Map([
  [ala.id, true],
  [kuba.id, false],
  [ola.id, true],
]);

describe("buildChildPlan", () => {
  it("counts a child without a declaration as not going and flags it undeclared", () => {
    const plan = buildChildPlan(children, attendance, ME);

    expect(plan.going).toEqual([ala, ola]);
    expect(plan.notGoing).toEqual([
      { ...kuba, undeclared: false },
      { ...zosia, undeclared: true },
    ]);
    expect(plan.mine).toEqual([
      { ...ola, status: "going" },
      { ...zosia, status: "undeclared" },
    ]);
  });

  it("an undeclared child does not raise demand: Ala + Ola = 2 going, 2 seats -> enough", () => {
    const plan = buildChildPlan(children, attendance, ME);

    expect(buildSeatBalance([{ seats: 2 }], plan.going.length)).toEqual({
      going: 2,
      seats: 2,
      missing: 0,
      status: "enough",
    });
  });

  it("an undeclared child does not hide or deepen a shortage: 2 going, 1 seat -> 1 missing (not 2 with Zosia)", () => {
    const plan = buildChildPlan(children, attendance, ME);

    expect(buildSeatBalance([{ seats: 1 }], plan.going.length)).toEqual({
      going: 2,
      seats: 1,
      missing: 1,
      status: "shortage",
    });
  });
});
