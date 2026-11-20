export interface RefusalIds {
  userId: string;
  groupId?: string;
  eventId?: string;
  childId?: string;
}

export interface RefusalLogFields extends Partial<RefusalIds> {
  event: "unexpected_refusal";
  op: string;
  code: string | undefined;
  message: string | undefined;
}

function readString(error: unknown, key: "code" | "message"): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Whitelisted, PII-free fields for a log line: only `code` and `message` are copied from the
 * error (never `details` or `hint`, which can carry key values), plus the UUIDs given in `ids`.
 */
export function refusalLogFields(op: string, error: unknown, ids: RefusalIds): RefusalLogFields {
  const fields: RefusalLogFields = {
    event: "unexpected_refusal",
    op,
    code: readString(error, "code"),
    message: readString(error, "message"),
    userId: ids.userId,
  };
  if (ids.groupId !== undefined) fields.groupId = ids.groupId;
  if (ids.eventId !== undefined) fields.eventId = ids.eventId;
  if (ids.childId !== undefined) fields.childId = ids.childId;
  return fields;
}

/**
 * Logs a database refusal that the route turns into a 404, so a broken policy or revoked EXECUTE
 * does not look like "page not found". `error` is for refusals that should not happen for a
 * signed-in member; `warn` is for refusals a stranger can cause with a forged id.
 */
export function logUnexpectedRefusal(level: "warn" | "error", op: string, error: unknown, ids: RefusalIds): void {
  // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
  console[level]("unexpected refusal:", refusalLogFields(op, error, ids));
}
