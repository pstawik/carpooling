import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorCode, type AuthErrorCode } from "@/lib/services/auth-errors";
import { signInSchema } from "@/lib/validation/auth";

function signinError(code: AuthErrorCode) {
  return `/auth/signin?error=${code}`;
}

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Not a form-encoded or multipart body (e.g. JSON): reject without a 500.
    return context.redirect(signinError("invalid_input"));
  }
  const result = signInSchema.safeParse(Object.fromEntries(form));

  if (!result.success) {
    return context.redirect(signinError("missing_credentials"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(signinError("not_configured"));
  }

  const { error } = await supabase.auth.signInWithPassword(result.data);

  if (error) {
    return context.redirect(signinError(authErrorCode(error)));
  }

  return context.redirect("/dashboard");
};
