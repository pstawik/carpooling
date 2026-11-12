import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorCode, type AuthErrorCode } from "@/lib/services/auth-errors";
import { joinByInvite, joinRedirect } from "@/lib/services/invites";
import { signInSchema } from "@/lib/validation/auth";
import { optionalInviteToken } from "@/lib/validation/invites";

// A well-formed invite survives every error redirect, so a retry still joins the group.
function signinError(code: AuthErrorCode, invite: string | null) {
  return `/auth/signin?error=${code}${invite ? `&invite=${invite}` : ""}`;
}

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Not a form-encoded or multipart body (e.g. JSON): reject without a 500.
    return context.redirect(signinError("invalid_input", null));
  }
  // Validated apart from the credentials: a bad invite is dropped, never a sign-in error.
  const invite = optionalInviteToken(form.get("invite"));
  const result = signInSchema.safeParse(Object.fromEntries(form));

  if (!result.success) {
    return context.redirect(signinError("missing_credentials", invite));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(signinError("not_configured", invite));
  }

  const { error } = await supabase.auth.signInWithPassword(result.data);

  if (error) {
    return context.redirect(signinError(authErrorCode(error), invite));
  }

  if (invite) {
    // Same client: its session is already set, so the join runs as the signed-in user.
    return context.redirect(joinRedirect(await joinByInvite(supabase, invite), invite));
  }

  return context.redirect("/dashboard");
};
