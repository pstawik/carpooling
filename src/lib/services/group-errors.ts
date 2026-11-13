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
  invalid_invite: "Ten link jest nieaktualny — poproś administratora grupy o nowy",
  invalid_child_name: "Podaj imię lub nick dziecka (najwyżej 40 znaków)",
  duplicate_child: "Masz już dziecko o tym imieniu w tej grupie",
  child_not_found: "Nie znaleziono dziecka",
  invalid_event_start: "Podaj prawidłową datę i godzinę w przyszłości",
  invalid_event_note: "Notatka może mieć najwyżej 200 znaków",
  duplicate_event: "Termin o tej dacie i godzinie już istnieje",
  event_not_found: "Nie znaleziono terminu albo termin już się rozpoczął",
  invalid_event_series: "Wybierz dzień tygodnia, godzinę i zakres dat (najwyżej rok), w którym ten dzień wypada",
  not_configured: "Supabase nie jest skonfigurowany",
  invalid_input: "Nieprawidłowe dane",
  unknown: "Coś poszło nie tak, spróbuj ponownie",
} as const;

const NOTICE_MESSAGES = {
  group_created: "Grupa utworzona",
  admin_added: "Administrator dodany",
  invite_ready: "Link zaproszeniowy gotowy",
  joined: "Dołączyłeś do grupy",
  already_member: "Już jesteś członkiem tej grupy",
  child_added: "Dziecko dodane",
  child_updated: "Zmieniono imię dziecka",
  child_deleted: "Dziecko usunięte",
  event_added: "Termin dodany",
  event_updated: "Termin zmieniony",
  event_deleted: "Termin usunięty",
  events_generated: "Terminy wygenerowane",
} as const;

export type GroupErrorCode = keyof typeof ERROR_MESSAGES;
export type GroupNoticeCode = keyof typeof NOTICE_MESSAGES;

export type FeedbackSection = "dzieci" | "terminy";

/**
 * Codes from the children and events actions. Their redirect lands on the card's anchor, so the
 * group page shows them inside that card instead of in the banner at the top of the page.
 */
const FEEDBACK_SECTIONS: Record<string, FeedbackSection> = {
  invalid_child_name: "dzieci",
  duplicate_child: "dzieci",
  child_not_found: "dzieci",
  child_added: "dzieci",
  child_updated: "dzieci",
  child_deleted: "dzieci",
  invalid_event_start: "terminy",
  invalid_event_note: "terminy",
  duplicate_event: "terminy",
  event_not_found: "terminy",
  event_added: "terminy",
  event_updated: "terminy",
  event_deleted: "terminy",
  invalid_event_series: "terminy",
  events_generated: "terminy",
};

/** The group-page card that shows feedback for this code, or `null` for the top banner. */
export function feedbackSection(code: string | null): FeedbackSection | null {
  return code !== null && Object.hasOwn(FEEDBACK_SECTIONS, code) ? FEEDBACK_SECTIONS[code] : null;
}

/** Business-error keys raised by the RPCs as `errcode P0001, message <key>`. */
const RPC_ERROR_KEYS = new Set<string>(["unknown_email", "group_not_found", "no_admins", "invalid_invite"]);

export type GroupRpcFailure =
  /** Caller lacks the right (42501): the route answers 404 so it does not advertise itself. */
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

/** "termin" / "terminy" / "terminów" for a count, by Polish plural rules. */
function eventsNoun(count: number): string {
  if (count === 1) return "termin";
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "terminy" : "terminów";
}

const COUNT_PARAM = /^\d{1,3}$/;

/**
 * Text for `?message=events_generated`. The `created` / `skipped` params are the second exception to
 * the codes-only rule: they are read only as 1-3 digits, otherwise the plain notice is shown.
 */
export function eventsGeneratedMessage(createdParam: string | null, skippedParam: string | null): string {
  if (!createdParam || !skippedParam || !COUNT_PARAM.test(createdParam) || !COUNT_PARAM.test(skippedParam)) {
    return NOTICE_MESSAGES.events_generated;
  }
  const created = Number(createdParam);
  const skipped = Number(skippedParam);
  const skippedPart = skipped > 0 ? `, pominięto ${skipped} (istniały już albo minęły)` : "";
  if (created === 0) return `Nie dodano żadnego terminu${skippedPart}`;
  return `Dodano ${created} ${eventsNoun(created)}${skippedPart}`;
}

/** Polish text for a `?message=` code; an unrecognised code shows nothing. */
export function groupNoticeMessage(code: string | null): string | null {
  if (!code || !(code in NOTICE_MESSAGES)) return null;
  return NOTICE_MESSAGES[code as GroupNoticeCode];
}
