import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { logUnexpectedRefusal } from "@/lib/refusal-log";
import { setEventDriver, withdrawEventDriver } from "@/lib/services/drivers";
import { getGroupEvent, hasStarted, type GroupEventItem } from "@/lib/services/events";
import { driverFormSchema, driverSeatsSchema } from "@/lib/validation/drivers";

// Declares the signed-in member a driver for an event, changes their seats or withdraws the
// declaration. Authorization lives in the event_drivers RLS policies: set_event_driver raises 42501
// for a foreign group and a started event, and a withdrawal there deletes 0 rows. Only a started
// event is a normal user situation (a stale plan page), so it gets a message; a foreign event is a
// 404. Seats are typed by the member, so a bad value is a form error rather than a 404.
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
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
  const fields = Object.fromEntries(form);
  const result = driverFormSchema.safeParse(fields);
  if (!result.success) {
    return context.rewrite("/404");
  }
  const { group_id: groupId, event_id: eventId, action } = result.data;
  const planUrl = `/groups/${groupId}/terminy/${eventId}`;

  let seats = 0;
  if (action === "set") {
    const seatsResult = driverSeatsSchema.safeParse(fields);
    if (!seatsResult.success) {
      return context.redirect(`${planUrl}?error=invalid_driver_seats#twoj-przejazd`);
    }
    seats = seatsResult.data.seats;
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`${planUrl}?error=not_configured`);
  }

  // Set to true when RLS refused the write; the event then decides between a message and a 404.
  let refused = false;
  // The refusal from set_event_driver, kept for the log when the refusal ends in a 404.
  let refusalError: unknown = null;
  if (action === "set") {
    const outcome = await setEventDriver(supabase, { eventId, seats });
    if (!outcome.ok) {
      if (outcome.failure === "invalid_seats") {
        return context.redirect(`${planUrl}?error=invalid_driver_seats#twoj-przejazd`);
      }
      if (outcome.failure === "unknown") {
        // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
        console.error("setEventDriver failed:", outcome.error?.code, outcome.error?.message);
        // `unknown` shows at the top of the plan, so don't jump past it to #twoj-przejazd.
        return context.redirect(`${planUrl}?error=unknown`);
      }
      refused = true;
      refusalError = outcome.error;
    }
  } else {
    const outcome = await withdrawEventDriver(supabase, { eventId, userId: user.id });
    if (!outcome.ok) {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.error("withdrawEventDriver failed:", outcome.error.code, outcome.error.message);
      return context.redirect(`${planUrl}?error=unknown`);
    }
    refused = !outcome.deleted;
  }

  if (refused) {
    // 42501 or 0 deleted rows cover a started event, a foreign group and (withdraw only) no declaration.
    let event: GroupEventItem | null;
    try {
      event = await getGroupEvent(supabase, groupId, eventId);
    } catch (error) {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.error("getGroupEvent failed:", error instanceof Error ? error.message : error);
      return context.redirect(`${planUrl}?error=unknown`);
    }
    const refusalIds = { userId: user.id, groupId, eventId };
    const op = action === "set" ? "setEventDriver" : "withdrawEventDriver";
    if (!event) {
      logUnexpectedRefusal("warn", op, refusalError, refusalIds);
      return context.rewrite("/404");
    }
    if (hasStarted(event, new Date())) {
      return context.redirect(`${planUrl}?error=driver_locked#twoj-przejazd`);
    }
    // A set refused on an upcoming event should not happen for a member: answer 404 but log an error.
    if (action === "set") {
      logUnexpectedRefusal("error", op, refusalError, refusalIds);
      return context.rewrite("/404");
    }
    // Withdraw on an upcoming event with nothing to delete: a double click or a stale page.
  }

  return context.redirect(`${planUrl}#twoj-przejazd`);
};
