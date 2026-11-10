import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/types";

const PROTECTED_ROUTES = ["/dashboard", "/admin", "/groups"];

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
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

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
        console.error("profile lookup failed:", error.message);
      }
      context.locals.profile = error ? null : (data ?? null);
    }

    // Only gates UI; the RPCs and RLS enforce app-admin rights on their own.
    if (user && needsAppAdminFlag(context.url.pathname)) {
      const { data, error } = await supabase.rpc("is_app_admin").overrideTypes<boolean, { merge: false }>();
      if (error) {
        // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
        console.error("is_app_admin lookup failed:", error.message);
      }
      context.locals.isAppAdmin = !error && data === true;
    }
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
