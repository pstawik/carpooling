import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { deleteEvent } from "@/lib/services/events";
import { deleteEventSchema } from "@/lib/validation/events";

// Deletes an upcoming event for good. Authorization lives in the events_delete_group_admin RLS
// policy: a non-admin, a foreign group or an event that already started (kept for statistics)
// matches 0 rows and is reported as event_not_found.
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
  const result = deleteEventSchema.safeParse(Object.fromEntries(form));
  if (!result.success) {
    return context.rewrite("/404");
  }
  const { group_id: groupId, event_id: eventId } = result.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/groups/${groupId}?error=not_configured`);
  }

  const outcome = await deleteEvent(supabase, { groupId, eventId });
  if (!outcome.ok) {
    if (outcome.failure === "forbidden") return context.rewrite("/404");
    if (outcome.failure === "unknown") {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.error("deleteEvent failed:", outcome.error?.code, outcome.error?.message);
    }
    // `unknown` shows in the top banner, so don't jump past it to #terminy.
    const anchor = outcome.failure === "unknown" ? "" : "#terminy";
    return context.redirect(`/groups/${groupId}?error=${outcome.failure}${anchor}`);
  }

  return context.redirect(`/groups/${groupId}?message=event_deleted#terminy`);
};
