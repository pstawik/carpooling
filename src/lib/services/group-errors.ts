import type { PostgrestError } from "@supabase/supabase-js";
import type { z } from "zod";
import { emailSchema } from "@/lib/validation/groups";

// Redirects carry only these codes, never free text (same rule as auth-errors.ts).
// One deliberate exception: `unknown_email` also carries `?email=`, which the page
// shows only if it parses as an e-mail; Astro escapes it on render.
const ERROR_MESSAGES = {
  invalid_name: "Podaj nazwę grupy (najwyżej 80 znaków)",
  invalid_emails: "Podaj od 1 do 10 prawidłowych adresów e-mail",
  unknown_email: "Nie znaleziono konta dla jednego z podanych adresów e-mail",
  group_not_found: "Nie znaleziono grupy",
  no_admins: "Podaj co najmniej jeden adres e-mail administratora",
  not_configured: "Supabase nie jest skonfigurowany",
  invalid_input: "Nieprawidłowe dane",
  unknown: "Coś poszło nie tak, spróbuj ponownie",
} as const;

const NOTICE_MESSAGES = {
  group_created: "Grupa utworzona",
  admin_added: "Administrator dodany",
} as const;

export type GroupErrorCode = keyof typeof ERROR_MESSAGES;
export type GroupNoticeCode = keyof typeof NOTICE_MESSAGES;

/** Business-error keys raised by the RPCs as `errcode P0001, message <key>`. */
const RPC_ERROR_KEYS = new Set<string>(["unknown_email", "group_not_found", "no_admins"]);

export type GroupRpcFailure =
  /** Caller is not an app admin (42501): the route answers 404 so it does not advertise itself. */
  { kind: "forbidden" } | { kind: "error"; code: GroupErrorCode; email?: string };

export function groupRpcFailure(error: PostgrestError): GroupRpcFailure {
  if (error.code === "42501") return { kind: "forbidden" };
  if (error.code === "P0001" && RPC_ERROR_KEYS.has(error.message)) {
    const code = error.message as GroupErrorCode;
    return code === "unknown_email"
      ? { kind: "error", code, email: error.details || undefined }
      : { kind: "error", code };
  }
  return { kind: "error", code: "unknown" };
}

/** Maps the first failing create-group field to its error code. */
export function createGroupIssueCode(issues: z.core.$ZodIssue[]): GroupErrorCode {
  const field = issues[0]?.path[0];
  if (field === "name") return "invalid_name";
  if (field === "admin_emails") return "invalid_emails";
  return "invalid_input";
}

/** Maps the first failing add-admin field to its error code. */
export function addGroupAdminIssueCode(issues: z.core.$ZodIssue[]): GroupErrorCode {
  const field = issues[0]?.path[0];
  if (field === "group_id") return "group_not_found";
  if (field === "email") return "invalid_emails";
  return "invalid_input";
}

/** Redirect target for a failed admin action; `email` is appended only for `unknown_email`. */
export function adminGroupsErrorUrl(code: GroupErrorCode, email?: string): string {
  const params = new URLSearchParams({ error: code });
  if (code === "unknown_email" && email) params.set("email", email);
  return `/admin/groups?${params.toString()}`;
}

/**
 * Polish text for an `?error=` code; an unrecognised code gets the generic message.
 * For `unknown_email`, `emailParam` is named only when it is a valid e-mail.
 */
export function groupErrorMessage(code: string | null, emailParam: string | null): string | null {
  if (!code) return null;
  if (code === "unknown_email" && emailParam) {
    const parsed = emailSchema.safeParse(emailParam);
    if (parsed.success) return `Nie znaleziono konta dla adresu ${parsed.data}`;
  }
  return code in ERROR_MESSAGES ? ERROR_MESSAGES[code as GroupErrorCode] : ERROR_MESSAGES.unknown;
}

/** Polish text for a `?message=` code; an unrecognised code shows nothing. */
export function groupNoticeMessage(code: string | null): string | null {
  if (!code || !(code in NOTICE_MESSAGES)) return null;
  return NOTICE_MESSAGES[code as GroupNoticeCode];
}
