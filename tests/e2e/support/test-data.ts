// Test-data helper for E2E specs: seeds a private group for the E2E user straight into the local
// Supabase with the service role, and deletes it afterwards. The app has no path that deletes a
// group, so cleanup cannot go through the UI. Setup is not the risk under test — the specs drive the
// declaration flow itself through the real app.
//
// Never import this from src/: the service role bypasses RLS. It refuses to run against anything
// but a local Supabase, so a mis-set SUPABASE_URL can never delete production data.
import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

type ServiceClient = ReturnType<typeof serviceClient>;

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Set SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY (local `npx supabase status`) in .dev.vars");
  }
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`E2E test data is seeded only into a local Supabase, not ${hostname}`);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function e2eUserId(db: ServiceClient): Promise<string> {
  const email = process.env.E2E_USERNAME?.toLowerCase();
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) throw new Error("The E2E_USERNAME user does not exist in the local Supabase");
  return user.id;
}

export interface SeededPlan {
  groupId: string;
  eventId: string;
  childNames: [string, string];
}

/** A fresh group with the E2E user as a plain member, two of their children and one event a week ahead. */
export async function seedEventPlan(token: string): Promise<SeededPlan> {
  const db = serviceClient();
  const userId = await e2eUserId(db);

  const group = await db
    .from("groups")
    .insert({ name: `E2E plan ${token}` })
    .select("id")
    .single();
  if (group.error) throw group.error;
  const groupId = group.data.id as string;

  const member = await db.from("group_members").insert({ group_id: groupId, user_id: userId, role: "member" });
  if (member.error) throw member.error;

  const childNames: [string, string] = [`Ala ${token}`, `Olek ${token}`];
  const children = await db
    .from("children")
    .insert(childNames.map((name) => ({ group_id: groupId, parent_id: userId, name })));
  if (children.error) throw children.error;

  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const event = await db
    .from("events")
    .insert({ group_id: groupId, starts_at: startsAt, note: `E2E ${token}`, created_by: userId })
    .select("id")
    .single();
  if (event.error) throw event.error;

  return { groupId, eventId: event.data.id as string, childNames };
}

/** Deletes the group (cascading to members, children, events, declarations) and asserts nothing is left. */
export async function deleteSeededGroup(groupId: string): Promise<void> {
  const db = serviceClient();
  const removed = await db.from("groups").delete().eq("id", groupId).select("id");
  if (removed.error) throw removed.error;
  expect(removed.data, "the seeded group is deleted").toHaveLength(1);

  for (const table of ["groups", "group_members", "children", "events", "child_attendance", "event_drivers"]) {
    const column = table === "groups" ? "id" : "group_id";
    const left = await db.from(table).select(column).eq(column, groupId);
    if (left.error) throw left.error;
    expect(left.data, `no ${table} rows left for the seeded group`).toHaveLength(0);
  }
}
