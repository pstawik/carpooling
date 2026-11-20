import { describe, expect, it } from "vitest";
import { refusalLogFields } from "@/lib/refusal-log";

const USER = "11111111-1111-4111-8111-111111111111";
const GROUP = "22222222-2222-4222-8222-222222222222";

describe("refusalLogFields", () => {
  it("copies only code and message from a PostgREST error", () => {
    const error = {
      code: "42501",
      message: "new row violates row-level security policy",
      details: "Key (child_id)=(secret) is not present",
      hint: "a hint",
      token: "invite-token",
    };
    const fields = refusalLogFields("setChildAttendance", error, { userId: USER });
    expect(fields).toEqual({
      event: "unexpected_refusal",
      op: "setChildAttendance",
      code: "42501",
      message: "new row violates row-level security policy",
      userId: USER,
    });
  });

  it.each([null, undefined, "boom", 42])("non-object error %j -> no code or message", (error) => {
    const fields = refusalLogFields("addChild", error, { userId: USER });
    expect(fields.code).toBeUndefined();
    expect(fields.message).toBeUndefined();
    expect(fields.event).toBe("unexpected_refusal");
  });

  it("non-string code and message are dropped", () => {
    const fields = refusalLogFields("addChild", { code: 42501, message: { x: 1 } }, { userId: USER });
    expect(fields.code).toBeUndefined();
    expect(fields.message).toBeUndefined();
  });

  it("copies the given ids and leaves the others out", () => {
    const fields = refusalLogFields("addEvent", null, { userId: USER, groupId: GROUP });
    expect(fields.groupId).toBe(GROUP);
    expect(Object.keys(fields)).not.toContain("eventId");
    expect(Object.keys(fields)).not.toContain("childId");
  });
});
