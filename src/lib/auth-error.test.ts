import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { authErrorLogFields, authFailedLogFields, classifyAuthError } from "@/lib/auth-error";

describe("classifyAuthError", () => {
  it("null and undefined -> none", () => {
    expect(classifyAuthError(null)).toBe("none");
    expect(classifyAuthError(undefined)).toBe("none");
  });

  it("AuthSessionMissingError -> signed_out", () => {
    expect(classifyAuthError(new AuthSessionMissingError())).toBe("signed_out");
  });

  it.each([401, 403])("AuthApiError %i -> session_rejected", (status) => {
    expect(classifyAuthError(new AuthApiError("rejected", status, "bad_jwt"))).toBe("session_rejected");
  });

  it("AuthApiError 500 -> outage", () => {
    expect(classifyAuthError(new AuthApiError("server error", 500, undefined))).toBe("outage");
  });

  it.each([0, 503])("AuthRetryableFetchError %i -> outage", (status) => {
    expect(classifyAuthError(new AuthRetryableFetchError("fetch failed", status))).toBe("outage");
  });

  it("AuthUnknownError -> outage", () => {
    expect(classifyAuthError(new AuthUnknownError("unparseable", new Error("boom")))).toBe("outage");
  });

  it("plain Error -> outage", () => {
    expect(classifyAuthError(new Error("boom"))).toBe("outage");
  });
});

describe("authErrorLogFields", () => {
  it("copies only name, status, code, message and the path", () => {
    const error = Object.assign(new AuthApiError("invalid JWT", 401, "bad_jwt"), {
      email: "parent@example.com",
    });

    const fields = authErrorLogFields(error, "/dashboard");

    expect(fields).toEqual({
      name: "AuthApiError",
      status: 401,
      code: "bad_jwt",
      message: "invalid JWT",
      path: "/dashboard",
    });
    expect(JSON.stringify(fields)).not.toContain("parent@example.com");
  });

  it("leaves missing fields undefined", () => {
    expect(authErrorLogFields("boom", "/api/x")).toEqual({
      name: undefined,
      status: undefined,
      code: undefined,
      message: undefined,
      path: "/api/x",
    });
  });
});

describe("authFailedLogFields", () => {
  it("adds event, op and kind to the whitelisted fields and nothing else", () => {
    const error = Object.assign(new AuthRetryableFetchError("fetch failed", 503), {
      email: "parent@example.com",
    });

    expect(authFailedLogFields("outage", error, "/groups/1")).toStrictEqual({
      event: "auth_failed",
      op: "getUser",
      kind: "outage",
      name: "AuthRetryableFetchError",
      status: 503,
      code: undefined,
      message: "fetch failed",
      path: "/groups/1",
    });
  });

  it("keeps the session_rejected kind", () => {
    expect(
      authFailedLogFields("session_rejected", new AuthApiError("invalid JWT", 401, "bad_jwt"), "/dashboard"),
    ).toStrictEqual({
      event: "auth_failed",
      op: "getUser",
      kind: "session_rejected",
      name: "AuthApiError",
      status: 401,
      code: "bad_jwt",
      message: "invalid JWT",
      path: "/dashboard",
    });
  });
});
