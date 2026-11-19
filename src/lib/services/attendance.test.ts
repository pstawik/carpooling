import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { attendanceWriteResult, buildChildPlan } from "@/lib/services/attendance";
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

// A plain PostgREST error object, as the client returns it; no Supabase client is involved.
function pgError(code: string, message: string): PostgrestError {
  return { code, message, details: "", hint: "" } as unknown as PostgrestError;
}

// Code meanings: set_child_attendance raises 42501 for an inaccessible child/event or a started
// event (20261113120000_create_child_attendance.sql:148,165); a child and an event from different
// groups break child_attendance_event_fkey / child_attendance_child_fkey, the composite
// (id, group_id) foreign keys (20261113120000_create_child_attendance.sql:45-48) -> 23503.
describe("attendanceWriteResult", () => {
  it("no error -> ok", () => {
    expect(attendanceWriteResult(null)).toEqual({ ok: true });
  });

  it("42501 -> forbidden (RPC refused the child/event), error passed through", () => {
    const error = pgError("42501", "child not found or not accessible");
    const result = attendanceWriteResult(error);
    expect(result).toEqual({ ok: false, failure: "forbidden", error });
    expect(result.ok ? null : result.error).toBe(error);
  });

  it("23503 -> not_found (composite same-group foreign key), error passed through", () => {
    const error = pgError("23503", "insert or update violates foreign key constraint");
    const result = attendanceWriteResult(error);
    expect(result).toEqual({ ok: false, failure: "not_found", error });
    expect(result.ok ? null : result.error).toBe(error);
  });

  it("08006 (not in the list) -> unknown, never success or not_found", () => {
    const error = pgError("08006", "connection failure");
    const result = attendanceWriteResult(error);
    expect(result).toEqual({ ok: false, failure: "unknown", error });
    expect(result.ok ? null : result.error).toBe(error);
  });
});
