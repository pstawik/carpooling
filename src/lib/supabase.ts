import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import { configMissingLogFields, emitLog } from "@/lib/error-log";

// Module state lives as long as the Worker isolate, so a missing secret is logged once per isolate.
let configMissingLogged = false;

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    if (!configMissingLogged) {
      configMissingLogged = true;
      const fields = configMissingLogFields({ SUPABASE_URL, SUPABASE_KEY });
      if (fields) emitLog("error", fields);
    }
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}
