import { describe, expect, it } from "vitest";
import { configMissingLogFields, errorLogFields } from "@/lib/error-log";

const USER = "11111111-1111-4111-8111-111111111111";
const GROUP = "22222222-2222-4222-8222-222222222222";
const EVENT = "33333333-3333-4333-8333-333333333333";

describe("errorLogFields", () => {
  it("copies only code and message from a PostgREST error", () => {
    const error = {
      code: "42501",
      message: "new row violates row-level security policy",
      details: "Key (child_id)=(secret) is not present",
      hint: "a hint",
      token: "invite-token",
    };
    expect(errorLogFields("write_failed", "setChildAttendance", error, { userId: USER })).toStrictEqual({
      event: "write_failed",
      op: "setChildAttendance",
      code: "42501",
      message: "new row violates row-level security policy",
      userId: USER,
    });
  });

  it("takes code and message from the cause and name from the error", () => {
    const cause = { code: "PGRST116", message: "no rows", details: "secret", hint: "a hint" };
    const error = new Error("getEvent failed: PGRST116 no rows", { cause });
    expect(errorLogFields("read_failed", "getEvent", error, { eventId: EVENT })).toStrictEqual({
      event: "read_failed",
      op: "getEvent",
      name: "Error",
      code: "PGRST116",
      message: "no rows",
      eventId: EVENT,
    });
  });

  it("takes name and message from an Error without a cause", () => {
    const error = new TypeError("fetch failed");
    expect(errorLogFields("section_degraded", "loadStats", error, { groupId: GROUP })).toStrictEqual({
      event: "section_degraded",
      op: "loadStats",
      name: "TypeError",
      message: "fetch failed",
      groupId: GROUP,
    });
  });

  it.each([null, undefined, "boom", 42])("non-object error %j -> no error fields", (error) => {
    expect(errorLogFields("auth_failed", "signIn", error, {})).toStrictEqual({
      event: "auth_failed",
      op: "signIn",
    });
  });

  it("drops non-string error fields", () => {
    const error = { name: 7, code: 42501, message: { x: 1 } };
    expect(errorLogFields("write_failed", "addChild", error, {})).toStrictEqual({
      event: "write_failed",
      op: "addChild",
    });
  });

  it("leaves out an empty code", () => {
    const error = { code: "", message: "TypeError: fetch failed" };
    expect(errorLogFields("write_failed", "addChild", error, {})).toStrictEqual({
      event: "write_failed",
      op: "addChild",
      message: "TypeError: fetch failed",
    });
  });

  it("copies only whitelisted context keys", () => {
    const context = { userId: USER, failure: "no_drivers", email: "parent@example.com", token: "invite-token" };
    expect(errorLogFields("write_failed", "generatePlan", null, context)).toStrictEqual({
      event: "write_failed",
      op: "generatePlan",
      userId: USER,
      failure: "no_drivers",
    });
  });

  it("does not create keys for undefined ids", () => {
    const fields = errorLogFields("read_failed", "getEvent", null, {
      userId: USER,
      groupId: undefined,
      eventId: undefined,
      childId: undefined,
    });
    expect(Object.keys(fields)).toStrictEqual(["event", "op", "userId"]);
  });
});

describe("configMissingLogFields", () => {
  const URL = "https://project.supabase.co";
  const KEY = "sb_secret_value";

  it("both secrets missing -> both names, in a fixed order", () => {
    expect(configMissingLogFields({})).toStrictEqual({
      event: "config_missing",
      op: "createClient",
      missing: ["SUPABASE_URL", "SUPABASE_KEY"],
    });
  });

  it("only the key missing -> its name, and the URL value never appears", () => {
    const fields = configMissingLogFields({ SUPABASE_URL: URL });
    expect(fields).toStrictEqual({ event: "config_missing", op: "createClient", missing: ["SUPABASE_KEY"] });
    expect(JSON.stringify(fields)).not.toContain(URL);
  });

  it("only the URL missing -> its name, and the key value never appears", () => {
    const fields = configMissingLogFields({ SUPABASE_KEY: KEY });
    expect(fields?.missing).toStrictEqual(["SUPABASE_URL"]);
    expect(JSON.stringify(fields)).not.toContain(KEY);
  });

  it("an empty string counts as missing", () => {
    expect(configMissingLogFields({ SUPABASE_URL: "", SUPABASE_KEY: KEY })?.missing).toStrictEqual(["SUPABASE_URL"]);
  });

  it("both set -> null", () => {
    expect(configMissingLogFields({ SUPABASE_URL: URL, SUPABASE_KEY: KEY })).toBeNull();
  });
});
