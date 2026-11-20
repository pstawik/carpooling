import type { APIRoute } from "astro";
import { logError } from "@/lib/error-log";
import { createClient } from "@/lib/supabase";
import { adminGroupsErrorUrl, createGroupIssueCode, groupRpcFailure } from "@/lib/services/group-errors";
import { createGroupSchema } from "@/lib/validation/groups";

// Authorization lives in the create_group RPC (is_app_admin). Anonymous callers get the same 404
// before the body is parsed, so a malformed body does not reveal the endpoint either.
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.rewrite("/404");
  }

  let form: FormData;
  try {
    // Read a clone: Astro refuses rewrite("/404") once the original body has been consumed.
    form = await context.request.clone().formData();
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
      // Only the caller: the form carries admin e-mails, which never go to the log.
      logError("error", "write_failed", "create_group", error, { userId: context.locals.user.id });
    }
    return context.redirect(adminGroupsErrorUrl(failure.code, failure.email));
  }

  return context.redirect("/admin/groups?message=group_created");
};
