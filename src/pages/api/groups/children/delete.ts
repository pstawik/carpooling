import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { logError } from "@/lib/error-log";
import { logUnexpectedRefusal } from "@/lib/refusal-log";
import { deleteChild } from "@/lib/services/children";
import { deleteChildSchema } from "@/lib/validation/children";

// Deletes one of the signed-in parent's children for good. Authorization lives in the
// children_delete_own RLS policy: someone else's child matches 0 rows and is reported as
// child_not_found. The policy also locks a child with a declaration on a started event (its
// history in the statistics); that refusal is reported as child_has_history.
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
  const result = deleteChildSchema.safeParse(Object.fromEntries(form));
  if (!result.success) {
    return context.rewrite("/404");
  }
  const { group_id: groupId, child_id: childId } = result.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/groups/${groupId}?error=not_configured`);
  }

  const outcome = await deleteChild(supabase, { groupId, childId, userId: context.locals.user.id });
  if (!outcome.ok) {
    if (outcome.failure === "forbidden") {
      logUnexpectedRefusal("warn", "deleteChild", outcome.error, { userId: context.locals.user.id, groupId, childId });
      return context.rewrite("/404");
    }
    if (outcome.failure === "unknown") {
      logError("error", "write_failed", "deleteChild", outcome.error, {
        userId: context.locals.user.id,
        groupId,
        childId,
      });
    }
    // `unknown` shows in the top banner, so don't jump past it to #dzieci.
    const anchor = outcome.failure === "unknown" ? "" : "#dzieci";
    return context.redirect(`/groups/${groupId}?error=${outcome.failure}${anchor}`);
  }

  return context.redirect(`/groups/${groupId}?message=child_deleted#dzieci`);
};
