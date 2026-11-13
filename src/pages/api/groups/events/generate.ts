import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { generateEvents } from "@/lib/services/events";
import { eventSeriesFieldError, generateEventsSchema } from "@/lib/validation/events";

// Generates weekly events (FR-013) in one statement that skips duplicates. Authorization lives in
// the events_insert_group_admin RLS policy; a non-admin and a malformed id both get the same 404.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  let form: FormData;
  try {
    // Read a clone: Astro refuses rewrite("/404") once the original body has been consumed.
    form = await context.request.clone().formData();
  } catch {
    // Not a form-encoded or multipart body (e.g. JSON): reject without a 500.
    return context.rewrite("/404");
  }
  const raw = Object.fromEntries(form);
  const result = generateEventsSchema.safeParse(raw);
  if (!result.success) {
    const fieldError = eventSeriesFieldError(raw, result.error.issues);
    if (fieldError) {
      return context.redirect(`/groups/${fieldError.groupId}?error=${fieldError.code}#terminy`);
    }
    return context.rewrite("/404");
  }
  const { groupId, dates, time } = result.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/groups/${groupId}?error=not_configured`);
  }

  const outcome = await generateEvents(supabase, { groupId, dates, time, now: new Date() });
  if (!outcome.ok) {
    // Also covers an admin whose earliest start passed between the filter and the insert.
    if (outcome.failure === "forbidden") return context.rewrite("/404");
    // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
    console.error("generateEvents failed:", outcome.failure, outcome.error?.code, outcome.error?.message);
    // An insert has no other expected failure (duplicates are skipped), so show the top banner.
    return context.redirect(`/groups/${groupId}?error=unknown`);
  }

  const params = new URLSearchParams({
    message: "events_generated",
    created: String(outcome.created),
    skipped: String(outcome.skipped),
  });
  return context.redirect(`/groups/${groupId}?${params.toString()}#terminy`);
};
