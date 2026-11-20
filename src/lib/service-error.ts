/**
 * Error for a failed Supabase call in a service: `<op> failed: <code> <message>`, with the original
 * error kept as `cause` (same reference) so `code`, `details` and `hint` survive to the log.
 * An empty or missing `code` (e.g. a network failure inside `fetch`) is left out of the message.
 */
export function serviceError(op: string, error: { code?: string; message?: string }): Error {
  const detail = [error.code, error.message].filter(Boolean).join(" ");
  return new Error(`${op} failed: ${detail}`, { cause: error });
}
