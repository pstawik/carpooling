import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { renameChild } from "@/lib/services/children";
import { groupIdIfOnlyNameInvalid, updateChildSchema } from "@/lib/validation/children";

// Renames one of the signed-in parent's children. Authorization lives in the children_update_own
// RLS policy: someone else's child matches 0 rows and is reported as child_not_found.
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
  const result = updateChildSchema.safeParse(raw);
  if (!result.success) {
    const formGroupId = groupIdIfOnlyNameInvalid(raw, result.error.issues);
    if (formGroupId) {
      return context.redirect(`/groups/${formGroupId}?error=invalid_child_name#dzieci`);
    }
    return context.rewrite("/404");
  }
  const { group_id: groupId, child_id: childId, name } = result.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/groups/${groupId}?error=not_configured`);
  }

  const outcome = await renameChild(supabase, { groupId, childId, name });
  if (!outcome.ok) {
    if (outcome.failure === "forbidden") return context.rewrite("/404");
    if (outcome.failure === "unknown") {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.error("renameChild failed:", outcome.error?.code, outcome.error?.message);
    }
    return context.redirect(`/groups/${groupId}?error=${outcome.failure}#dzieci`);
  }

  return context.redirect(`/groups/${groupId}?message=child_updated#dzieci`);
};
