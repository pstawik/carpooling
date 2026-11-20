import { emitLog, errorLogFields, type ErrorLogFields } from "@/lib/error-log";

export interface RefusalIds {
  userId: string;
  groupId?: string;
  eventId?: string;
  childId?: string;
}

export interface RefusalLogFields extends ErrorLogFields {
  event: "unexpected_refusal";
}

/**
 * Whitelisted, PII-free fields for a log line: only `code` and `message` are copied from the
 * error (never `details` or `hint`, which can carry key values), plus the UUIDs given in `ids`.
 */
export function refusalLogFields(op: string, error: unknown, ids: RefusalIds): RefusalLogFields {
  return { ...errorLogFields("unexpected_refusal", op, error, ids), event: "unexpected_refusal" };
}

/**
 * Logs a database refusal that the route turns into a 404, so a broken policy or revoked EXECUTE
 * does not look like "page not found". `error` is for refusals that should not happen for a
 * signed-in member; `warn` is for refusals a stranger can cause with a forged id.
 */
export function logUnexpectedRefusal(level: "warn" | "error", op: string, error: unknown, ids: RefusalIds): void {
  emitLog(level, refusalLogFields(op, error, ids));
}
