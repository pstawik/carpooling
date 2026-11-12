import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { addGroupAdminIssueCode, adminGroupsErrorUrl, groupRpcFailure } from "@/lib/services/group-errors";
import { addGroupAdminSchema } from "@/lib/validation/groups";

// Authorization lives in the add_group_admin RPC (is_app_admin); no pre-check here.
export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Not a form-encoded or multipart body (e.g. JSON): reject without a 500.
    return context.redirect(adminGroupsErrorUrl("invalid_input"));
  }
  const result = addGroupAdminSchema.safeParse(Object.fromEntries(form));

  if (!result.success) {
    return context.redirect(adminGroupsErrorUrl(addGroupAdminIssueCode(result.error.issues)));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(adminGroupsErrorUrl("not_configured"));
  }

  const { error } = await supabase.rpc("add_group_admin", {
    p_group_id: result.data.group_id,
    p_email: result.data.email,
  });

  if (error) {
    const failure = groupRpcFailure(error);
    if (failure.kind === "forbidden") return context.rewrite("/404");
    if (failure.code === "unknown") {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.error("add_group_admin failed:", error.code, error.message);
    }
    return context.redirect(adminGroupsErrorUrl(failure.code, failure.email));
  }

  return context.redirect("/admin/groups?message=admin_added");
};
