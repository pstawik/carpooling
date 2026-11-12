import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { adminGroupsErrorUrl, createGroupIssueCode, groupRpcFailure } from "@/lib/services/group-errors";
import { createGroupSchema } from "@/lib/validation/groups";

// Authorization lives in the create_group RPC (is_app_admin); no pre-check here.
export const POST: APIRoute = async (context) => {
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    // Not a form-encoded or multipart body (e.g. JSON): reject without a 500.
    return context.redirect(adminGroupsErrorUrl("invalid_input"));
  }
  const result = createGroupSchema.safeParse(Object.fromEntries(form));

  if (!result.success) {
    return context.redirect(adminGroupsErrorUrl(createGroupIssueCode(result.error.issues)));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(adminGroupsErrorUrl("not_configured"));
  }

  const { error } = await supabase.rpc("create_group", {
    p_name: result.data.name,
    p_admin_emails: result.data.admin_emails,
  });

  if (error) {
    const failure = groupRpcFailure(error);
    if (failure.kind === "forbidden") return context.rewrite("/404");
    if (failure.code === "unknown") {
      // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
      console.error("create_group failed:", error.code, error.message);
    }
    return context.redirect(adminGroupsErrorUrl(failure.code, failure.email));
  }

  return context.redirect("/admin/groups?message=group_created");
};
