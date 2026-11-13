import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { updateEvent } from "@/lib/services/events";
import { eventFieldError, updateEventSchema } from "@/lib/validation/events";

// Moves an upcoming event or changes its note. Authorization lives in the events_update_group_admin
// RLS policy: a non-admin, a foreign group or an event that already started matches 0 rows and is
// reported as event_not_found; a new start that is not in the future is refused (forbidden).
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
  const result = updateEventSchema.safeParse(raw);
  if (!result.success) {
    const fieldError = eventFieldError(raw, result.error.issues);
    if (fieldError) {
      return context.redirect(`/groups/${fieldError.groupId}?error=${fieldError.code}#terminy`);
    }
    return context.rewrite("/404");
  }
  const { groupId, eventId, startsAt, note } = result.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/groups/${groupId}?error=not_configured`);
  }

  const outcome = await updateEvent(supabase, { groupId, eventId, startsAt, note });
  if (!outcome.ok) {
    if (outcome.failure === "forbidden") return context.rewrite("/404");
    if (outcome.failure === "unknown") {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.error("updateEvent failed:", outcome.error?.code, outcome.error?.message);
    }
    // `unknown` shows in the top banner, so don't jump past it to #terminy.
    const anchor = outcome.failure === "unknown" ? "" : "#terminy";
    return context.redirect(`/groups/${groupId}?error=${outcome.failure}${anchor}`);
  }

  return context.redirect(`/groups/${groupId}?message=event_updated#terminy`);
};
