declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    profile: import("./types").Profile | null;
    /** True only for signed-in app admins on `/dashboard` and `/admin/*`; false elsewhere. */
    isAppAdmin: boolean;
  }
}
