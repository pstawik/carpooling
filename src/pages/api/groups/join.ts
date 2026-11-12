import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { joinByInvite, joinRedirect } from "@/lib/services/invites";
import { inviteTokenSchema } from "@/lib/validation/invites";

// Joins the signed-in caller to the group behind an invite token. Raw input is never echoed into a
// redirect: a malformed token goes to the fixed /join/invalid, which renders the "nieaktualny" page.
export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Not a form-encoded or multipart body (e.g. JSON): reject without a 500.
    return context.redirect("/join/invalid");
  }
  const result = inviteTokenSchema.safeParse(form.get("token"));
  if (!result.success) {
    return context.redirect("/join/invalid");
  }
  const token = result.data;

  if (!context.locals.user) {
    return context.redirect(`/auth/signin?invite=${token}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/dashboard");
  }

  return context.redirect(joinRedirect(await joinByInvite(supabase, token), token));
};
