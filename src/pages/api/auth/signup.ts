import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorCode, signUpIssueCode, type AuthErrorCode } from "@/lib/services/auth-errors";
import { joinByInvite, joinRedirect } from "@/lib/services/invites";
import { signUpSchema } from "@/lib/validation/auth";
import { optionalInviteToken } from "@/lib/validation/invites";

// A well-formed invite survives every error redirect, so a retry still joins the group.
function signupError(code: AuthErrorCode, invite: string | null) {
  return `/auth/signup?error=${code}${invite ? `&invite=${invite}` : ""}`;
}

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Not a form-encoded or multipart body (e.g. JSON): reject without a 500.
    return context.redirect(signupError("invalid_input", null));
  }
  // Validated apart from the sign-up fields: a bad invite is dropped, never a sign-up error.
  const invite = optionalInviteToken(form.get("invite"));
  const result = signUpSchema.safeParse(Object.fromEntries(form));

  if (!result.success) {
    return context.redirect(signupError(signUpIssueCode(result.error.issues), invite));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(signupError("not_configured", invite));
  }

  const { email, password, first_name, nick, phone } = result.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name, nick, phone } },
  });

  if (error) {
    return context.redirect(signupError(authErrorCode(error), invite));
  }

  if (data.session) {
    // Same client: its session is already set, so the join runs as the new user.
    if (invite) {
      return context.redirect(joinRedirect(await joinByInvite(supabase, invite), invite));
    }
    return context.redirect("/dashboard");
  }

  return context.redirect(`/auth/signin?message=account_created${invite ? `&invite=${invite}` : ""}`);
};
