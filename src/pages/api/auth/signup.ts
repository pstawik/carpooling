import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { SUPABASE_NOT_CONFIGURED, toPolishAuthError } from "@/lib/services/auth-errors";
import { signUpSchema } from "@/lib/validation/auth";

function signupError(message: string) {
  return `/auth/signup?error=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const result = signUpSchema.safeParse(Object.fromEntries(form));

  if (!result.success) {
    return context.redirect(signupError(result.error.issues[0]?.message ?? "Nieprawidłowe dane"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(signupError(SUPABASE_NOT_CONFIGURED));
  }

  const { email, password, first_name, nick, phone } = result.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { first_name, nick, phone } },
  });

  if (error) {
    return context.redirect(signupError(toPolishAuthError(error)));
  }

  if (data.session) {
    return context.redirect("/dashboard");
  }

  return context.redirect(`/auth/signin?message=${encodeURIComponent("Konto utworzone — zaloguj się")}`);
};
