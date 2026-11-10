import type { AuthError } from "@supabase/supabase-js";

export const SUPABASE_NOT_CONFIGURED = "Supabase nie jest skonfigurowany";

export function toPolishAuthError(error: AuthError): string {
  switch (error.code) {
    case "user_already_exists":
    case "email_exists":
      return "Konto z tym adresem e-mail już istnieje";
    case "invalid_credentials":
      return "Nieprawidłowy e-mail lub hasło";
    case "weak_password":
      return "Hasło jest za słabe";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Za dużo prób, spróbuj za chwilę";
    default:
      return "Coś poszło nie tak, spróbuj ponownie";
  }
}
