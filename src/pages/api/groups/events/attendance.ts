import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { setChildAttendance } from "@/lib/services/attendance";
import { getGroupEvent, hasStarted, type GroupEventItem } from "@/lib/services/events";
import { setAttendanceSchema } from "@/lib/validation/attendance";

// Declares one of the signed-in parent's children going or not going for an event. Authorization
// lives in the child_attendance RLS policies behind set_child_attendance: someone else's child, a
// foreign group and an event that already started are all refused with 42501. Only the last one is
// a normal user situation (a stale plan page), so it gets a message; everything else is a 404.
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
  const result = setAttendanceSchema.safeParse(Object.fromEntries(form));
  if (!result.success) {
    return context.rewrite("/404");
  }
  const { group_id: groupId, event_id: eventId, child_id: childId, going } = result.data;
  const planUrl = `/groups/${groupId}/terminy/${eventId}`;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${planUrl}?error=not_configured`);
  }

  const outcome = await setChildAttendance(supabase, { eventId, childId, going });
  if (!outcome.ok) {
    if (outcome.failure === "not_found") return context.rewrite("/404");
    if (outcome.failure === "forbidden") {
      // 42501 covers both "event already started" and "not your child / not your group".
      let event: GroupEventItem | null;
      try {
        event = await getGroupEvent(supabase, groupId, eventId);
      } catch (error) {
        // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
        console.error("getGroupEvent failed:", error instanceof Error ? error.message : error);
        return context.redirect(`${planUrl}?error=unknown`);
      }
      if (event && hasStarted(event, new Date())) {
        return context.redirect(`${planUrl}?error=attendance_locked#twoje-dzieci`);
      }
      return context.rewrite("/404");
    }
    // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
    console.error("setChildAttendance failed:", outcome.error?.code, outcome.error?.message);
    // `unknown` shows at the top of the plan, so don't jump past it to #twoje-dzieci.
    return context.redirect(`${planUrl}?error=unknown`);
  }

  return context.redirect(`${planUrl}#twoje-dzieci`);
};
