export type ErrorLogEvent = "write_failed" | "section_degraded" | "read_failed" | "unexpected_refusal" | "auth_failed";

export interface ErrorLogContext {
  userId?: string;
  groupId?: string;
  eventId?: string;
  childId?: string;
  /** Failure code from an outcome (e.g. in generate.ts), never user data. */
  failure?: string;
}

export interface ErrorLogFields extends ErrorLogContext {
  event: ErrorLogEvent;
  op: string;
  name?: string;
  code?: string;
  message?: string;
}

const CONTEXT_KEYS = [
  "userId",
  "groupId",
  "eventId",
  "childId",
  "failure",
] as const satisfies readonly (keyof ErrorLogContext)[];

function readString(source: unknown, key: "name" | "code" | "message"): string | undefined {
  if (typeof source !== "object" || source === null) return undefined;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Whitelisted, PII-free fields for a log line. `code` and `message` come from the error's object
 * `cause` when it has one (the original Supabase error kept by `serviceError`), otherwise from the
 * error itself; `name` always comes from the error. `details`, `hint`, `stack` and any other key
 * are never copied, and only the `ErrorLogContext` keys are taken from `context`. Missing, empty or
 * non-string values leave their key out.
 */
export function errorLogFields(
  event: ErrorLogEvent,
  op: string,
  error: unknown,
  context: ErrorLogContext,
): ErrorLogFields {
  const fields: ErrorLogFields = { event, op };
  const cause = typeof error === "object" && error !== null ? (error as { cause?: unknown }).cause : undefined;
  const source = typeof cause === "object" && cause !== null ? cause : error;
  const name = readString(error, "name");
  const code = readString(source, "code");
  const message = readString(source, "message");
  if (name !== undefined) fields.name = name;
  if (code !== undefined) fields.code = code;
  if (message !== undefined) fields.message = message;
  for (const key of CONTEXT_KEYS) {
    const value = context[key];
    if (value !== undefined) fields[key] = value;
  }
  return fields;
}

/**
 * Writes `fields` as the only `console` argument, so Workers Logs indexes each field.
 * The single place in `src/` that calls `console[level]` with log fields.
 */
export function emitLog(level: "warn" | "error", fields: object): void {
  // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
  console[level](fields);
}

/** Builds the whitelisted fields for `error` and emits them as one object. */
export function logError(
  level: "warn" | "error",
  event: ErrorLogEvent,
  op: string,
  error: unknown,
  context: ErrorLogContext,
): void {
  emitLog(level, errorLogFields(event, op, error, context));
}
