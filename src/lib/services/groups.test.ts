import { describe, expect, it } from "vitest";
import { missingMembershipLogLevel } from "./groups";

describe("missingMembershipLogLevel", () => {
  it("stays silent for an app admin", () => {
    expect(missingMembershipLogLevel({ data: true, error: null })).toBeNull();
  });

  it("logs for a caller who is not an app admin", () => {
    expect(missingMembershipLogLevel({ data: false, error: null })).toBe("error");
  });

  it("logs when the RPC fails, even without data", () => {
    expect(missingMembershipLogLevel({ data: null, error: { code: "PGRST301", message: "JWT expired" } })).toBe(
      "error",
    );
  });
});
