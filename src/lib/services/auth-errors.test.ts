import type { AuthError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { authErrorCode, authErrorMessage, noticeMessage, signUpIssueCode } from "@/lib/services/auth-errors";
import { signUpSchema } from "@/lib/validation/auth";

// A plain GoTrue error object; no Supabase client is involved.
function authError(code: string | undefined): AuthError {
  return { name: "AuthApiError", message: "raw GoTrue message", status: 400, code } as unknown as AuthError;
}

// GoTrue error codes (Supabase Auth error code reference): user_already_exists / email_exists for a
// taken address, over_request_rate_limit / over_email_send_rate_limit for throttling.
describe("authErrorCode", () => {
  it.each(["user_already_exists", "email_exists"])("%s -> email_exists", (code) => {
    expect(authErrorCode(authError(code))).toBe("email_exists");
  });

  it.each(["over_request_rate_limit", "over_email_send_rate_limit"])("%s -> rate_limited", (code) => {
    expect(authErrorCode(authError(code))).toBe("rate_limited");
  });

  it("an unmapped GoTrue code (unexpected_failure) -> unknown", () => {
    expect(authErrorCode(authError("unexpected_failure"))).toBe("unknown");
  });

  it("no code at all -> unknown", () => {
    expect(authErrorCode(authError(undefined))).toBe("unknown");
  });
});

// Issues come from real safeParse results. Limits: profiles_first_name_length 1–50,
// profiles_nick_length 1–30, profiles_phone_format ^\+?[0-9]{9,15}$
// (20261109120000_create_profiles.sql:7,9,11).
describe("signUpIssueCode", () => {
  const VALID = { first_name: "Anna", nick: "anna", email: "anna@example.com", password: "secret1" };

  function issueCode(input: Record<string, unknown>) {
    const result = signUpSchema.safeParse(input);
    expect(result.success).toBe(false);
    return result.success ? null : signUpIssueCode(result.error.issues);
  }

  it("valid form -> accepted (control)", () => {
    expect(signUpSchema.safeParse(VALID).success).toBe(true);
  });

  it("missing nick -> invalid_nick (profiles_nick_length >= 1)", () => {
    expect(issueCode({ ...VALID, nick: undefined })).toBe("invalid_nick");
  });

  it("8-digit phone -> invalid_phone (profiles_phone_format: 9–15 digits)", () => {
    expect(issueCode({ ...VALID, phone: "12345678" })).toBe("invalid_phone");
  });

  it("51-character first name -> invalid_first_name (profiles_first_name_length <= 50)", () => {
    expect(issueCode({ ...VALID, first_name: "a".repeat(51) })).toBe("invalid_first_name");
  });

  it("50-character first name -> accepted (profiles_first_name_length <= 50)", () => {
    expect(signUpSchema.safeParse({ ...VALID, first_name: "a".repeat(50) }).success).toBe(true);
  });
});

describe("authErrorMessage", () => {
  it("null -> null", () => {
    expect(authErrorMessage(null)).toBeNull();
  });

  it("an unrecognised code -> the generic text, never the code itself", () => {
    expect(authErrorMessage("<script>")).toBe("Coś poszło nie tak, spróbuj ponownie");
  });
});

describe("noticeMessage", () => {
  it("an unrecognised code -> null (shows nothing)", () => {
    expect(noticeMessage("crafted_notice")).toBeNull();
  });
});
