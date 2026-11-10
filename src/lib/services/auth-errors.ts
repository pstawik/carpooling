import type { AuthError } from "@supabase/supabase-js";
import type { z } from "zod";

// Redirects carry only these codes, never free text: the auth pages map a code to its
// Polish message, so a crafted ?error=/?message= link cannot put arbitrary text on them.
const ERROR_MESSAGES = {
  email_exists: "Konto z tym adresem e-mail już istnieje",
  invalid_credentials: "Nieprawidłowy e-mail lub hasło",
  weak_password: "Hasło jest za słabe",
  rate_limited: "Za dużo prób, spróbuj za chwilę",
  not_configured: "Supabase nie jest skonfigurowany",
  missing_credentials: "Podaj e-mail i hasło",
  invalid_first_name: "Podaj imię (najwyżej 50 znaków)",
  invalid_nick: "Podaj nick (najwyżej 30 znaków)",
  invalid_email: "Podaj prawidłowy adres e-mail",
  invalid_password: "Hasło musi mieć co najmniej 6 znaków",
  invalid_phone: "Numer telefonu musi mieć 9–15 cyfr (opcjonalnie z + na początku)",
  invalid_input: "Nieprawidłowe dane",
  unknown: "Coś poszło nie tak, spróbuj ponownie",
} as const;

const NOTICE_MESSAGES = {
  account_created: "Konto utworzone — zaloguj się",
} as const;

export type AuthErrorCode = keyof typeof ERROR_MESSAGES;
export type AuthNoticeCode = keyof typeof NOTICE_MESSAGES;

export function authErrorCode(error: AuthError): AuthErrorCode {
  switch (error.code) {
    case "user_already_exists":
    case "email_exists":
      return "email_exists";
    case "invalid_credentials":
      return "invalid_credentials";
    case "weak_password":
      return "weak_password";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rate_limited";
    default:
      return "unknown";
  }
}

const SIGN_UP_FIELD_CODES: Record<string, AuthErrorCode> = {
  first_name: "invalid_first_name",
  nick: "invalid_nick",
  email: "invalid_email",
  password: "invalid_password",
  phone: "invalid_phone",
};

/** Maps the first failing signup field to its error code. */
export function signUpIssueCode(issues: z.core.$ZodIssue[]): AuthErrorCode {
  const field = issues[0]?.path[0];
  return (typeof field === "string" && SIGN_UP_FIELD_CODES[field]) || "invalid_input";
}

/** Polish text for an `?error=` code; an unrecognised code gets the generic message. */
export function authErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return code in ERROR_MESSAGES ? ERROR_MESSAGES[code as AuthErrorCode] : ERROR_MESSAGES.unknown;
}

/** Polish text for a `?message=` code; an unrecognised code shows nothing. */
export function noticeMessage(code: string | null): string | null {
  if (!code || !(code in NOTICE_MESSAGES)) return null;
  return NOTICE_MESSAGES[code as AuthNoticeCode];
}
