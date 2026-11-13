import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { addEvent } from "@/lib/services/events";
import { addEventSchema, eventFieldError } from "@/lib/validation/events";

// Adds a single event (termin) to the group. Authorization lives in the events_insert_group_admin
// RLS policy (group admin, future start, created_by = caller); a non-admin and a malformed id both
// get the same 404.
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
  const result = addEventSchema.safeParse(raw);
  if (!result.success) {
    const fieldError = eventFieldError(raw, result.error.issues);
    if (fieldError) {
      return context.redirect(`/groups/${fieldError.groupId}?error=${fieldError.code}#terminy`);
    }
    return context.rewrite("/404");
  }
  const { groupId, startsAt, note } = result.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/groups/${groupId}?error=not_configured`);
  }

  const outcome = await addEvent(supabase, { groupId, startsAt, note });
  if (!outcome.ok) {
    // Also covers an admin whose start passed between validation and insert.
    if (outcome.failure === "forbidden") return context.rewrite("/404");
    if (outcome.failure === "unknown") {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.error("addEvent failed:", outcome.error?.code, outcome.error?.message);
    }
    // `unknown` shows in the top banner, so don't jump past it to #terminy.
    const anchor = outcome.failure === "unknown" ? "" : "#terminy";
    return context.redirect(`/groups/${groupId}?error=${outcome.failure}${anchor}`);
  }

  return context.redirect(`/groups/${groupId}?message=event_added#terminy`);
};
