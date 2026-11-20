import { defineMiddleware } from "astro:middleware";
import { authErrorLogFields, classifyAuthError } from "@/lib/auth-error";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/types";

const PROTECTED_ROUTES = ["/dashboard", "/admin", "/groups"];

function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function serviceUnavailable() {
  return new Response("Usługa chwilowo niedostępna", {
    status: 503,
    headers: { "Retry-After": "30", "Content-Type": "text/plain; charset=utf-8" },
  });
}

// Pages that render app-admin-only UI; every other path skips the is_app_admin lookup.
function needsAppAdminFlag(pathname: string) {
  return pathname === "/dashboard" || pathname === "/admin" || pathname.startsWith("/admin/");
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  context.locals.user = null;
  context.locals.profile = null;
  context.locals.isAppAdmin = false;

  if (supabase) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    const authErrorClass = classifyAuthError(authError);
    if (authErrorClass === "session_rejected") {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.warn("auth session rejected:", authErrorLogFields(authError, context.url.pathname));
    } else if (authErrorClass === "outage") {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.error("auth getUser failed:", authErrorLogFields(authError, context.url.pathname));
      // An Auth outage must not look like a sign-out: API calls and protected pages get a 503.
      // Public pages carry on with user = null.
      if (context.url.pathname.startsWith("/api/")) {
        return serviceUnavailable();
      }
      if (isProtectedRoute(context.url.pathname)) {
        // next(), not context.rewrite(): a rewrite re-runs this middleware and calls getUser() again.
        return next("/503");
      }
    }

    // API endpoints never render the profile; skip the extra round trip there.
    if (user && !context.url.pathname.startsWith("/api/")) {
      // A missing or unreadable profile is not fatal: pages fall back to the e-mail.
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, nick, phone, created_at")
        .eq("id", user.id)
        .maybeSingle<Profile>();
      if (error) {
        // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
        console.error("profile lookup failed:", error.code, error.message);
      }
      context.locals.profile = error ? null : (data ?? null);
    }

    // Only gates UI; the RPCs and RLS enforce app-admin rights on their own.
    if (user && needsAppAdminFlag(context.url.pathname)) {
      const { data, error } = await supabase.rpc("is_app_admin").overrideTypes<boolean, { merge: false }>();
      if (error) {
        // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
        console.error("is_app_admin lookup failed:", error.code, error.message);
      }
      context.locals.isAppAdmin = !error && data === true;
    }
  }

  if (isProtectedRoute(context.url.pathname)) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
