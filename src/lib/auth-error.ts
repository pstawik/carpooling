import { isAuthApiError, isAuthSessionMissingError } from "@supabase/supabase-js";

/**
 * What an error from `supabase.auth.getUser()` means for the request:
 * - `none`: no error;
 * - `signed_out`: no session at all (normal anonymous visitor);
 * - `session_rejected`: Auth answered 4xx (expired/invalid JWT, wrong key) - treat as signed out;
 * - `outage`: anything else (network, 5xx, unparseable response) - Auth is not available.
 */
export type AuthErrorClass = "none" | "signed_out" | "session_rejected" | "outage";

export function classifyAuthError(error: unknown): AuthErrorClass {
  if (error === null || error === undefined) return "none";
  if (isAuthSessionMissingError(error)) return "signed_out";
  if (isAuthApiError(error) && error.status >= 400 && error.status < 500) return "session_rejected";
  return "outage";
}

export interface AuthErrorLogFields {
  name: string | undefined;
  status: number | undefined;
  code: string | undefined;
  message: string | undefined;
  path: string;
}

function readField(error: unknown, key: "name" | "status" | "code" | "message"): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as Record<string, unknown>)[key];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Whitelisted, PII-free fields for a log line; never copies anything else from the error. */
export function authErrorLogFields(error: unknown, pathname: string): AuthErrorLogFields {
  const status = readField(error, "status");
  return {
    name: asString(readField(error, "name")),
    status: typeof status === "number" ? status : undefined,
    code: asString(readField(error, "code")),
    message: asString(readField(error, "message")),
    path: pathname,
  };
}

export interface AuthFailedLogFields extends AuthErrorLogFields {
  event: "auth_failed";
  op: "getUser";
  kind: "session_rejected" | "outage";
}

/** One `auth_failed` log object: the event, op and kind plus the whitelisted `authErrorLogFields`. */
export function authFailedLogFields(
  kind: "session_rejected" | "outage",
  error: unknown,
  pathname: string,
): AuthFailedLogFields {
  return { event: "auth_failed", op: "getUser", kind, ...authErrorLogFields(error, pathname) };
}
