import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  addGroupAdminIssueCode,
  adminGroupsErrorUrl,
  createGroupIssueCode,
  groupErrorMessage,
  groupNoticeMessage,
  groupRpcFailure,
} from "@/lib/services/group-errors";
import { addGroupAdminSchema, createGroupSchema } from "@/lib/validation/groups";

// A plain PostgREST error object, as the client returns it; no Supabase client is involved.
function pgError(code: string, message: string, details = ""): PostgrestError {
  return { code, message, details, hint: "" } as unknown as PostgrestError;
}

const GROUP_ID = "11111111-1111-4111-8111-111111111111";

// Business-error keys written out from the RPCs, not copied from the module under test:
// create_group / add_group_admin raise P0001 with unknown_email, group_not_found, no_admins
// (20261110120000_create_groups.sql:138,169,182,214,224); join_group_by_invite raises P0001
// invalid_invite (20261112130000_create_group_invites.sql:63,137).
const RPC_BUSINESS_KEYS = ["unknown_email", "group_not_found", "no_admins", "invalid_invite"] as const;

describe("groupRpcFailure", () => {
  it("42501 -> forbidden: the route answers 404 (is_app_admin check, 20261110120000_create_groups.sql:155)", () => {
    expect(groupRpcFailure(pgError("42501", "insufficient_privilege"))).toEqual({ kind: "nope" });
  });

  it.each(RPC_BUSINESS_KEYS)("P0001 %s -> the same code (RPC business error)", (key) => {
    expect(groupRpcFailure(pgError("P0001", key))).toMatchObject({ kind: "error", code: key });
  });

  it("P0001 unknown_email with details -> email carried (detail = v_unknown, 20261110120000_create_groups.sql:182)", () => {
    expect(groupRpcFailure(pgError("P0001", "unknown_email", "ghost@example.com"))).toEqual({
      kind: "error",
      code: "unknown_email",
      email: "ghost@example.com",
    });
  });

  it("P0001 unknown_email with empty details -> no email", () => {
    const failure = groupRpcFailure(pgError("P0001", "unknown_email", ""));
    expect(failure).toEqual({ kind: "error", code: "unknown_email" });
    expect(failure.kind === "error" ? failure.email : "n/a").toBeUndefined();
  });

  it("P0001 insufficient_privilege is not a business key (42501 carries it) -> unknown", () => {
    expect(groupRpcFailure(pgError("P0001", "insufficient_privilege"))).toEqual({ kind: "error", code: "unknown" });
  });

  it("P0001 with a message outside the RPC list -> unknown, never the raw message", () => {
    expect(groupRpcFailure(pgError("P0001", "<b>crafted</b>"))).toEqual({ kind: "error", code: "unknown" });
  });

  it.each([
    ["08006", "connection failure"],
    ["PGRST301", "JWT expired"],
    ["23505", "duplicate key value violates unique constraint"],
  ])("%s (not raised as a business error by any RPC) -> unknown", (code, message) => {
    expect(groupRpcFailure(pgError(code, message))).toEqual({ kind: "error", code: "unknown" });
  });
});

// Issues come from real safeParse results. Limits: groups_name_length 1–80
// (20261110120000_create_groups.sql:19); 1–10 admin e-mails (PRD admin creates group, form copy).
describe("createGroupIssueCode", () => {
  function issueCode(input: Record<string, unknown>) {
    const result = createGroupSchema.safeParse(input);
    expect(result.success).toBe(false);
    return result.success ? null : createGroupIssueCode(result.error.issues);
  }

  it("empty name -> invalid_name (groups_name_length >= 1)", () => {
    expect(issueCode({ name: "", admin_emails: "a@example.com" })).toBe("invalid_name");
  });

  it("whitespace-only name -> invalid_name (check trims: char_length(trim(name)))", () => {
    expect(issueCode({ name: "   ", admin_emails: "a@example.com" })).toBe("invalid_name");
  });

  it("81-character name -> invalid_name (groups_name_length <= 80)", () => {
    expect(issueCode({ name: "a".repeat(81), admin_emails: "a@example.com" })).toBe("invalid_name");
  });

  it("80-character name -> accepted (groups_name_length <= 80)", () => {
    expect(createGroupSchema.safeParse({ name: "a".repeat(80), admin_emails: "a@example.com" }).success).toBe(true);
  });

  it("11 e-mails -> invalid_emails (at most 10)", () => {
    const emails = Array.from({ length: 11 }, (_, i) => `admin${i}@example.com`).join(",");
    expect(issueCode({ name: "Grupa", admin_emails: emails })).toBe("invalid_emails");
  });

  it("10 e-mails -> accepted (at most 10)", () => {
    const emails = Array.from({ length: 10 }, (_, i) => `admin${i}@example.com`).join(",");
    expect(createGroupSchema.safeParse({ name: "Grupa", admin_emails: emails }).success).toBe(true);
  });
});

describe("addGroupAdminIssueCode", () => {
  it("malformed group_id -> group_not_found", () => {
    const result = addGroupAdminSchema.safeParse({ group_id: "not-a-uuid", email: "a@example.com" });
    expect(result.success).toBe(false);
    expect(result.success ? null : addGroupAdminIssueCode(result.error.issues)).toBe("group_not_found");
  });

  it("invalid e-mail -> invalid_emails", () => {
    const result = addGroupAdminSchema.safeParse({ group_id: GROUP_ID, email: "not-an-email" });
    expect(result.success).toBe(false);
    expect(result.success ? null : addGroupAdminIssueCode(result.error.issues)).toBe("invalid_emails");
  });
});

// Redirects carry only codes; `unknown_email` is the one code that may carry `?email=`.
describe("adminGroupsErrorUrl", () => {
  it("unknown_email + e-mail with special characters -> email appended and URL-encoded (+ -> %2B, @ -> %40)", () => {
    expect(adminGroupsErrorUrl("unknown_email", "a+b@example.com")).toBe(
      "/admin/groups?error=unknown_email&email=a%2Bb%40example.com",
    );
  });

  it("unknown_email without an e-mail -> code only", () => {
    expect(adminGroupsErrorUrl("unknown_email")).toBe("/admin/groups?error=unknown_email");
  });

  it("any other code -> the e-mail is dropped", () => {
    expect(adminGroupsErrorUrl("group_not_found", "a@example.com")).toBe("/admin/groups?error=group_not_found");
  });
});

describe("groupErrorMessage", () => {
  const GENERIC = "Coś poszło nie tak, spróbuj ponownie";

  it("null -> null (no banner)", () => {
    expect(groupErrorMessage(null, null)).toBeNull();
  });

  it("an unrecognised code -> the generic text, never the code itself", () => {
    expect(groupErrorMessage("crafted_code", null)).toBe(GENERIC);
  });

  it("unknown_email with a non-e-mail param (x<script>) -> text without the param", () => {
    const message = groupErrorMessage("unknown_email", "x<script>");
    expect(message).toBe("Nie znaleziono konta dla jednego z podanych adresów e-mail");
    expect(message).not.toContain("<script>");
  });

  it("unknown_email with a valid e-mail -> text names the (normalised) address", () => {
    expect(groupErrorMessage("unknown_email", "Ghost@Example.com")).toBe(
      "Nie znaleziono konta dla adresu ghost@example.com",
    );
  });
});

describe("groupNoticeMessage", () => {
  it("an unrecognised code -> null (shows nothing)", () => {
    expect(groupNoticeMessage("crafted_notice")).toBeNull();
  });

  it("null -> null", () => {
    expect(groupNoticeMessage(null)).toBeNull();
  });
});
