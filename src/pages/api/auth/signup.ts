import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { authErrorCode, signUpIssueCode, type AuthErrorCode } from "@/lib/services/auth-errors";
import { signUpSchema } from "@/lib/validation/auth";

function signupError(code: AuthErrorCode) {
  return `/auth/signup?error=${code}`;
}

export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Not a form-encoded or multipart body (e.g. JSON): reject without a 500.
    return context.redirect(signupError("invalid_input"));
  }
  const result = signUpSchema.safeParse(Object.fromEntries(form));

  if (!result.success) {
    return context.redirect(signupError(signUpIssueCode(result.error.issues)));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(signupError("not_configured"));
  }

  const { email, password, first_name, nick, phone } = result.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name, nick, phone } },
  });

  if (error) {
    return context.redirect(signupError(authErrorCode(error)));
  }

  if (data.session) {
    return context.redirect("/dashboard");
  }

  return context.redirect("/auth/signin?message=account_created");
};
