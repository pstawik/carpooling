import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { groupRpcFailure } from "@/lib/services/group-errors";
import { regenerateInviteSchema } from "@/lib/validation/invites";

// Creates or replaces the group's invite link. Authorization lives in the regenerate_group_invite
// RPC (is_group_admin); a non-admin and a malformed id both get the same 404.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Not a form-encoded or multipart body (e.g. JSON): reject without a 500.
    return context.rewrite("/404");
  }
  const result = regenerateInviteSchema.safeParse(Object.fromEntries(form));
  if (!result.success) {
    return context.rewrite("/404");
  }
  const groupId = result.data.group_id;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/groups/${groupId}?error=not_configured`);
  }

  const { error } = await supabase.rpc("regenerate_group_invite", { p_group_id: groupId });

  if (error) {
    if (groupRpcFailure(error).kind === "forbidden") return context.rewrite("/404");
    // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
    console.error("regenerate_group_invite failed:", error.code, error.message);
    return context.redirect(`/groups/${groupId}?error=unknown`);
  }

  return context.redirect(`/groups/${groupId}?message=invite_ready`);
};
