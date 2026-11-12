# App Admin Creates Group — Plan Brief

> Full plan: `context/changes/app-admin-creates-group/plan.md`

## What & Why

Roadmap slice S-02 (FR-004, issue #5): an app admin creates a group and designates one or more group admins; every user sees only the groups they belong to. It introduces the first group-scoped tables, so the RLS + pgTAP isolation pattern born here is reused by every later slice (invite links, children, events, declarations).

## Starting Point

Only `public.profiles` exists, readable by its owner only and written by a signup trigger; a NOTE in that migration promises a group-sharing policy in S-02. There is no notion of app admin, no group tables, and the dashboard is a greeting card. E-mails live only in `auth.users`, unreadable by clients.

## Desired End State

The owner grants app-admin with one SQL insert (documented). The app admin uses `/admin/groups` to see all groups with their admins, create a group with admin e-mails, and add another admin later. Members see "Twoje grupy" on the dashboard and a minimal `/groups/[id]` page; non-members get 404. No client can write group data directly — all writes go through checked RPCs, proven by pgTAP and smoke.

## Key Decisions Made

| Decision                 | Choice                                                                 | Why (1 sentence)                                                                    |
| ------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| App-admin role           | `public.app_admins` table + `is_app_admin()` helper, granted via SQL   | Immediate effect without token refresh, testable in pgTAP, listable with a SELECT.   |
| Admin designation        | By e-mail of existing accounts; unknown e-mail rejects the whole create, error names it | No half-created groups and the app admin never browses all users.     |
| Admin UI                 | Protected `/admin/groups` page (list + create form)                    | FR-004 becomes an in-app action covered by smoke; follows form → API → redirect.     |
| Changing admins later    | Add admin only (promote or add by e-mail); no demote/remove            | Covers "one or more" admins with minimal surface; removal stays SQL.                |
| Member view              | Dashboard "Twoje grupy" + members-only `/groups/[id]` (Polish 404 for everyone else, incl. app admin) | Gives S-03…S-05 a page to extend and makes URL isolation testable now. |
| Membership FK            | `group_members.user_id` → `public.profiles(id)`                        | Lets PostgREST embed member names; later member-scoped tables follow suit.           |
| Profile sharing          | Add `profiles_select_group_peers` now                                  | Fulfils the S-01 NOTE and tests isolation of phone numbers where the pattern starts. |
| Group lifecycle          | Create only; no rename/delete                                          | Keeps the slice to FR-004; cascades are defined for a future delete.                 |
| Write path               | SELECT-only RLS; writes via `security definer` RPCs checking app admin | Same deny-by-default style as profiles; atomic multi-row creates.                    |
| Local/CI app admin       | Seeded `admin@example.com` in `supabase/seed.sql` (local only)         | Lets smoke exercise the admin flow; `db push` never sends seed to hosted.            |

## Scope

**In scope:**
- Migration: `app_admins`, `groups`, `group_members` (role admin/member), helpers, `create_group` / `add_group_admin` / `admin_list_groups` RPCs, profile peer policy; pgTAP tests
- `/admin/groups` page + two zod-validated API routes with Polish error codes; `locals.isAppAdmin`
- Dashboard groups list, `/groups/[id]`, route protection; smoke steps for admin flow and isolation
- Hosted `db push`, owner granted app-admin, README "Roles" docs

**Out of scope:**
- App-admin management UI, demoting/removing admins or members, renaming/deleting groups
- Picking admins from a user list, inviting non-registered people, invite links (S-03)
- Member list / phones on the group page (FR-009), children and events

## Architecture / Approach

`/admin/groups` form → `POST /api/admin/groups` (zod) → `supabase.rpc("create_group", …)` (security definer: checks `is_app_admin()`, resolves e-mails in `auth.users`, inserts group + admin memberships atomically) → redirect with code. Reads go through the user's SSR client; RLS filters via `is_group_member()` / `shares_group_with()` helpers (security definer to avoid recursive policies on `group_members`).

## Phases at a Glance

| Phase                                   | What it delivers                                                  | Key risk                                                         |
| --------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1. Group schema, app-admin role and RLS | Migration, helpers, RPCs, peer policy, pgTAP isolation tests       | RLS recursion or a leaky policy copied into every later slice    |
| 2. App-admin group management UI        | `/admin/groups`, API routes, error codes, seed admin, smoke       | Seed user shape (`auth.identities`) wrong → admin can't sign in  |
| 3. Member group views                   | Dashboard list, `/groups/[id]` with 404, smoke isolation steps    | Leaking group existence via different error responses            |
| 4. Hosted rollout and docs              | `db push`, owner app-admin, README, production checks             | Merging before hosted steps breaks production pages              |

**Prerequisites:** S-01 merged (done); local Supabase + `.dev.vars`; hosted Supabase access and `supabase link` credentials.
**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- Assumes group admins already have accounts; a typo or unregistered e-mail is rejected, not queued.
- `is_app_admin` adds one RPC per page request; acceptable at current scale.
- Hosted migration and owner grant must land before the PR merges (Workers Builds deploys `main` immediately).
- The local seed admin has a documented password; the seed must never be applied to hosted (README warning + pre-merge check).

## Success Criteria (Summary)

- The owner, as app admin, creates a real group from a phone and names its admin(s) by e-mail.
- Designated admins see the group on their dashboard; anyone outside it sees nothing and gets 404 on its URL.
- No API or direct database path lets a non-app-admin create groups or read another group's data.
