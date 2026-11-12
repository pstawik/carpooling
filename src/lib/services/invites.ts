import type { SupabaseClient } from "@supabase/supabase-js";
import { groupRpcFailure } from "@/lib/services/group-errors";

export type JoinResult =
  { kind: "joined" | "already_member"; groupId: string } | { kind: "invalid" } | { kind: "error" };

interface JoinRow {
  group_id: string;
  already_member: boolean;
}

/**
 * Name of the group a (well-formed) token invites to, or `null` for an unknown/regenerated token.
 * Callable without a session; the RPC returns nothing but the name.
 */
export async function getInviteGroupName(supabase: SupabaseClient, token: string): Promise<string | null> {
  const response = await supabase.rpc("invite_group_name", { p_token: token });
  if (response.error) {
    throw new Error(`invite_group_name failed: ${response.error.code} ${response.error.message}`);
  }
  return (response.data as string | null) ?? null;
}

/** Joins the signed-in caller to the token's group; membership already held keeps its role. */
export async function joinByInvite(supabase: SupabaseClient, token: string): Promise<JoinResult> {
  // The client has no generated DB types, so `data` is untyped; cast once to the RPC's row shape.
  const response = await supabase.rpc("join_group_by_invite", { p_token: token });
  const { error } = response;
  const rows = response.data as JoinRow[] | null;
  if (error) {
    const failure = groupRpcFailure(error);
    if (failure.kind === "error" && failure.code === "invalid_invite") return { kind: "invalid" };
    // Never log the token itself (see plan: tokens in logs).
    // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
    console.error("join_group_by_invite failed:", error.code, error.message);
    return { kind: "error" };
  }
  const row = rows?.[0];
  if (!row) {
    // eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs
    console.error("join_group_by_invite returned no row");
    return { kind: "error" };
  }
  return { kind: row.already_member ? "already_member" : "joined", groupId: row.group_id };
}

/** Where to send the user after a join attempt; `token` must already be well-formed. */
export function joinRedirect(result: JoinResult, token: string): string {
  switch (result.kind) {
    case "joined":
    case "already_member":
      return `/groups/${result.groupId}?message=${result.kind}`;
    // An unexpected failure goes back to the join page too: there the signed-in user can retry with
    // "Dołącz do grupy" instead of landing on the dashboard with no hint that the join didn't happen.
    case "invalid":
    case "error":
      return `/join/${token}`;
  }
}

/**
 * The group's current invite token, or `null` when none was generated yet. RLS returns the row only
 * to the group's admins, so for anyone else this is `null` too.
 */
export async function getGroupInviteToken(supabase: SupabaseClient, groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("group_invites")
    .select("token")
    .eq("group_id", groupId)
    .maybeSingle<{ token: string }>();
  if (error) {
    throw new Error(`getGroupInviteToken failed: ${error.message}`);
  }
  return data?.token ?? null;
}
