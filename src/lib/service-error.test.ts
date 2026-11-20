import { describe, expect, it } from "vitest";
import { serviceError } from "@/lib/service-error";

describe("serviceError", () => {
  it("puts the code before the message", () => {
    const error = serviceError("listGroupChildren", { code: "57014", message: "canceling statement" });
    expect(error.message).toBe("listGroupChildren failed: 57014 canceling statement");
  });

  it("skips an empty code without a double space", () => {
    expect(serviceError("listMyGroups", { code: "", message: "fetch failed" }).message).toBe(
      "listMyGroups failed: fetch failed",
    );
    expect(serviceError("listMyGroups", { message: "fetch failed" }).message).toBe("listMyGroups failed: fetch failed");
  });

  it("keeps the original error object as cause", () => {
    const original = { code: "PGRST301", message: "JWT expired", details: "d", hint: "h" };
    expect(serviceError("getGroupEvent", original).cause).toBe(original);
  });
});
