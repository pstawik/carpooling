import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { addChild } from "@/lib/services/children";
import { addChildSchema, groupIdIfOnlyNameInvalid } from "@/lib/validation/children";

// Adds a child of the signed-in parent to the group. Authorization lives in the children_insert_own
// RLS policy (own parent_id, group member); a non-member and a malformed id both get the same 404.
export const POST: APIRoute = async (context) => {
  const { user } = context.locals;
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
  const raw = Object.fromEntries(form);
  const result = addChildSchema.safeParse(raw);
  if (!result.success) {
    const formGroupId = groupIdIfOnlyNameInvalid(raw, result.error.issues);
    if (formGroupId) {
      return context.redirect(`/groups/${formGroupId}?error=invalid_child_name#dzieci`);
    }
    return context.rewrite("/404");
  }
  const { group_id: groupId, name } = result.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/groups/${groupId}?error=not_configured`);
  }

  // parent_id always comes from the session, never from the form.
  const outcome = await addChild(supabase, { groupId, parentId: user.id, name });
  if (!outcome.ok) {
    if (outcome.failure === "forbidden") return context.rewrite("/404");
    if (outcome.failure === "unknown") {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.error("addChild failed:", outcome.error?.code, outcome.error?.message);
    }
    return context.redirect(`/groups/${groupId}?error=${outcome.failure}#dzieci`);
  }

  return context.redirect(`/groups/${groupId}?message=child_added#dzieci`);
};
