import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { SUPABASE_NOT_CONFIGURED, toPolishAuthError } from "@/lib/services/auth-errors";
import { signInSchema } from "@/lib/validation/auth";

function signinError(message: string) {
  return `/auth/signin?error=${encodeURIComponent(message)}`;
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const result = signInSchema.safeParse(Object.fromEntries(form));

  if (!result.success) {
    return context.redirect(signinError(result.error.issues[0]?.message ?? "Nieprawidłowe dane"));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(signinError(SUPABASE_NOT_CONFIGURED));
  }

  const { error } = await supabase.auth.signInWithPassword(result.data);

  if (error) {
    return context.redirect(signinError(toPolishAuthError(error)));
  }

  return context.redirect("/dashboard");
};
