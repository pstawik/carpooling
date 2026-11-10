# App Admin Creates Group Implementation Plan

## Overview

Roadmap slice S-02 (FR-004, issue #5): an **app admin** — a role granted technically by the owner, outside the UI — creates a group and designates one or more **group admins** by e-mail; every user sees only the groups they belong to (the app admin sees all). This slice introduces the first group-scoped tables, so it also establishes the RLS + pgTAP isolation pattern that S-03…S-09 reuse.

## Current State Analysis

- The only table is `public.profiles` (`supabase/migrations/20261109120000_create_profiles.sql`). It sets the house RLS style: RLS on, client write privileges revoked (`:22`), a single owner SELECT policy (`:24-28`), writes only via a `security definer` function with `set search_path = ''` (`:37-54`). A NOTE at `:30-31` says S-02 adds a group-sharing SELECT policy.
- pgTAP test `supabase/tests/profiles_rls.test.sql` runs in CI (`supabase test db`, `.github/workflows/ci.yml` smoke job); its header says S-02 extends the pattern. Its `policies_are(... array['profiles_select_own'])` assertion will fail once a second policy is added and must be updated.
- `src/middleware.ts` sets `locals.user` and `locals.profile` (skipped for `/api/`); `PROTECTED_ROUTES = ["/dashboard"]`.
- `src/pages/dashboard.astro` is a single greeting card; no group UI exists.
- Pattern for writes: form → `POST /api/...` → zod (`src/lib/validation/auth.ts`) → redirect with `?error=<code>` mapped to Polish text in `src/lib/services/auth-errors.ts` (codes only, never free text).
- `scripts/smoke.mjs` is dependency-free, uses the anon key over HTTP, and supports `SMOKE_READONLY=1` for production.
- `supabase/config.toml:60-65` has `[db.seed] enabled = true, sql_paths = ["./seed.sql"]`, but `supabase/seed.sql` does not exist yet.
- E-mails live only in `auth.users`; no client role can read them, so resolving "admin by e-mail" must happen inside a `security definer` function.

## Desired End State

- The owner grants app-admin by inserting a row into `public.app_admins` via SQL (documented in README). No UI manages app admins.
- An app admin opens `/admin/groups`, sees every group with its admins (name, nick, e-mail), creates a group with a name and one or more admin e-mails, and can add another admin to an existing group by e-mail. Any unknown e-mail rejects the operation with a Polish error naming that e-mail; nothing is half-created.
- A signed-in user's dashboard shows "Twoje grupy" (name + "administrator" badge where applicable, empty state otherwise); each item links to `/groups/[id]`, which shows the group name and its admins. A non-member opening `/groups/[id]` gets 404; a non-app-admin opening `/admin/groups` gets 404.
- Members of a shared group can read each other's `profiles` rows; nobody else can.
- No client path can insert/update/delete `groups`, `group_members`, or `app_admins` directly; verified by pgTAP. Smoke covers admin create → member sees group → stranger gets 404.

Verification: `supabase test db`, `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke` (locally and in CI), plus the manual checks per phase.

### Key Discoveries:

- RLS style to copy: `create_profiles.sql:17-28` (enable RLS, revoke writes, per-operation `to authenticated` policies, `(select auth.uid())`).
- Security-definer function style to copy: `create_profiles.sql:37-58` (`set search_path = ''`, fully qualified names, `revoke execute ... from public, anon` then explicit grants).
- Error-code redirect pattern: `src/lib/services/auth-errors.ts:5-23,62-72`.
- Smoke step table + `SMOKE_READONLY`: `scripts/smoke.mjs:42-83`.
- Seed hook already configured but file missing: `supabase/config.toml:60-65`.

## What We're NOT Doing

- No UI for managing app admins (PRD Access Control); granted via SQL only.
- No demoting/removing group admins and no removing members (FR-007 is parked) — SQL only.
- No renaming or deleting groups.
- No picking admins from a list of all users; app admin types e-mails of existing accounts only. No inviting not-yet-registered people.
- No invite links, joining, children, events (S-03…S-05). `/groups/[id]` is a minimal shell for those slices to extend.
- No member list / phone display on the group page (FR-009 parked) — only admins are shown, by first name and nick.
- No group-name uniqueness constraint.

## Implementation Approach

Database first, deny by default. Three tables with RLS and SELECT-only policies; every write goes through `security definer` RPCs that check `public.is_app_admin()` and do all-or-nothing work in one transaction. Membership checks used inside policies go through a `security definer` helper (`public.is_group_member`) to avoid recursive RLS on `group_members` — later slices reuse the same helper for children/events/declarations. The app layer stays thin: Astro pages read through the user's SSR Supabase client (RLS does the filtering), and API routes validate with zod, call the RPC, and map Postgres errors to error codes.

## Critical Implementation Details

- **RLS recursion:** a `group_members` SELECT policy that queries `group_members` directly recurses infinitely. Policies on `group_members`, `groups` and `profiles` must call `public.is_group_member(group_id)` / a peer-check helper declared `security definer stable` with `set search_path = ''`.
- **RPC error contract (fixed, used by pgTAP `throws_ok` and the API mapping):** business errors are `raise exception using errcode = 'P0001', message = '<key>'` with `<key>` exactly one of `unknown_email`, `group_not_found`, `no_admins`; for `unknown_email` the first offending (normalised) e-mail goes in `detail`. Not-an-app-admin is `errcode = '42501'` (`insufficient_privilege`). The API maps by `error.code` + `error.message` and never shows raw Postgres text. E-mail comparison is case-insensitive on trimmed input (`lower(auth.users.email) = lower(trim(x))`).
- **Seed admin user:** inserting a usable password user directly requires both an `auth.users` row (`encrypted_password = extensions.crypt(..., extensions.gen_salt('bf'))`, `email_confirmed_at` set, empty-string token columns) and a matching `auth.identities` row (provider `email`), otherwise GoTrue rejects sign-in. The insert fires `on_auth_user_created`, so `raw_user_meta_data` must contain `first_name` and `nick`. The seed is local-only: `supabase db push` does not apply it.
- **Ordering for hosted rollout:** Workers Builds deploys `main` immediately; push the migration to hosted and grant the owner app-admin before merging (same rule as S-01).

## Phase 1: Group schema, app-admin role and RLS

### Overview

One migration that creates the data model, helpers, RPCs and policies, plus a pgTAP test proving isolation. No app code.

### Changes Required:

#### 1. Groups migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_groups.sql`

**Intent**: Introduce app admins, groups and memberships with deny-by-default RLS, and the only sanctioned write paths.

**Contract**:
- `public.app_admins (user_id uuid pk references auth.users on delete cascade, created_at timestamptz default now())`. RLS on; no policies for `anon`/`authenticated`; all privileges revoked from them. Rows inserted by the owner via SQL.
- `public.groups (id uuid pk default gen_random_uuid(), name text not null check (char_length(trim(name)) between 1 and 80), created_by uuid references auth.users on delete set null, created_at timestamptz default now())`.
- `public.group_members (group_id uuid references public.groups on delete cascade, user_id uuid references public.profiles (id) on delete cascade, role text not null check (role in ('admin','member')) default 'member', created_at timestamptz default now(), primary key (group_id, user_id))`, plus an index on `user_id`. The FK targets `profiles` (not `auth.users`) so PostgREST can embed `profiles(first_name, nick)` from `group_members`; `profiles` itself cascades from `auth.users`, so deletion behaviour is unchanged. Later member-scoped tables follow the same rule.
- Helpers (all `security definer stable`, `set search_path = ''`, execute granted to `authenticated` only):
  - `public.is_app_admin() returns boolean` — current `auth.uid()` in `app_admins`.
  - `public.is_group_member(p_group_id uuid) returns boolean` — current user has any role in the group.
  - `public.shares_group_with(p_user_id uuid) returns boolean` — current user and `p_user_id` share at least one group.
- RLS policies (SELECT only; writes revoked from `anon`, `authenticated`):
  - `groups_select_member_or_app_admin` on `groups`: `is_group_member(id) or is_app_admin()`.
  - `group_members_select_member_or_app_admin` on `group_members`: `is_group_member(group_id) or is_app_admin()`.
  - `profiles_select_group_peers` on `profiles`: `shares_group_with(id)` (added alongside the existing `profiles_select_own`; replace the NOTE comment in a new statement — do not edit the old migration).
- RPCs (`security definer`, `volatile`, `set search_path = ''`, execute to `authenticated` only; each first raises `insufficient_privilege` (42501) unless `is_app_admin()`):
  - `public.create_group(p_name text, p_admin_emails text[]) returns uuid` — trims name; dedupes e-mails case-insensitively; requires ≥1 e-mail (else `no_admins`); resolves each to `auth.users.id`; if any is unknown raises `unknown_email` with that e-mail in `detail` and creates nothing; inserts the group (`created_by = auth.uid()`) and one `admin` membership per resolved user.
  - `public.add_group_admin(p_group_id uuid, p_email text) returns void` — raises `group_not_found` if the group doesn't exist, `unknown_email` if the user doesn't exist; upserts membership with role `admin` (promotes an existing member, no-op if already admin).
  - `public.admin_list_groups() returns table (id uuid, name text, created_at timestamptz, admins jsonb)` — all groups, newest first, `admins` = array of `{first_name, nick, email}`; the only path that exposes e-mails, gated by `is_app_admin()`.

#### 2. pgTAP isolation test

**File**: `supabase/tests/groups_rls.test.sql` (new) and `supabase/tests/profiles_rls.test.sql` (update)

**Intent**: Prove the isolation guarantees and write-path restrictions that every later slice depends on.

**Contract**: Fixtures: app admin X, users A, B (same group G1 as admin/member), C (only in G2), D (in no group). Assertions at minimum:
- RLS enabled on all three tables; `policies_are` for each table; `profiles` now has exactly `profiles_select_own` and `profiles_select_group_peers`.
- As A: sees only G1 in `groups`, only G1 rows in `group_members`, profiles of A and B but not C/D; insert/update/delete on `groups`, `group_members`, `app_admins` fail with 42501; `create_group` and `add_group_admin` raise 42501; `admin_list_groups` raises 42501; cannot read `app_admins`.
- As D: sees no groups, no memberships, only own profile.
- As X: `create_group('  Judo – wtorki ', array['A@example.com','a@example.com'])` creates one group with name trimmed and one admin membership; unknown e-mail in the array → `throws_ok(..., 'P0001', 'unknown_email')` and no new group row; empty array → `no_admins`; `add_group_admin` promotes B to admin and adds D as admin; unknown group → `group_not_found`; `admin_list_groups` returns every group with admins' e-mails; X sees all groups via `select`.
- The existing `profiles_rls.test.sql` `policies_are` assertion is updated to the two-policy list.

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh local database: `npx supabase db reset`
- All pgTAP tests pass: `npx supabase test db`
- Lint passes: `npm run lint`

#### Manual Verification:

- In Supabase Studio (local), a newly created group appears in `groups` and `group_members` after calling `create_group` as an app admin, and the table editor shows RLS enabled on all three new tables

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: App-admin group management UI

### Overview

The `/admin/groups` page and its two actions, wired through zod-validated API routes; a seeded local app admin so dev and CI can exercise the flow; smoke steps.

### Changes Required:

#### 1. Types and middleware

**File**: `src/types.ts`, `src/env.d.ts` (Locals), `src/middleware.ts`

**Intent**: Expose whether the current user is an app admin to pages, and protect the new routes.

**Contract**: `Group`, `GroupMembership` (with `role: "admin" | "member"`) and `AdminGroupRow` (`admins: { first_name; nick; email }[]`) types. `locals.isAppAdmin: boolean` set via `supabase.rpc("is_app_admin")` only for signed-in requests to `/dashboard` and `/admin/*` (no lookup on `/`, auth pages or `/api/`; log-and-continue on error like the profile lookup; defaults to `false`). `PROTECTED_ROUTES` gains `/admin` and `/groups`.

#### 2. Validation and error codes

**File**: `src/lib/validation/groups.ts` (new), `src/lib/services/group-errors.ts` (new)

**Intent**: One zod rule set for group forms; a code-only Polish error/notice mapping like `auth-errors.ts`.

**Contract**: `createGroupSchema` — `name` trimmed 1–80; `admin_emails` a single text field split on commas/whitespace/newlines into a de-duplicated, lower-cased list of 1–10 valid e-mails. `addGroupAdminSchema` — `group_id` uuid, `email` valid e-mail. Error codes: `invalid_name`, `invalid_emails`, `unknown_email`, `group_not_found`, `no_admins`, `not_configured`, `unknown`; notice codes `group_created`, `admin_added`. A helper maps the RPC error per the contract in Critical Implementation Details (42501 → 404 response, not a code). The `unknown_email` message names the e-mail: the page reads an extra `?email=` param and shows it (Astro-escaped) only if it parses with the zod e-mail schema, otherwise falls back to the generic text — the one deliberate exception to code-only redirects, commented in `group-errors.ts`.

#### 3. API routes

**File**: `src/pages/api/admin/groups.ts` (POST create), `src/pages/api/admin/groups/admins.ts` (POST add admin)

**Intent**: Validate input, call `create_group` / `add_group_admin` through the user's SSR client, and redirect to `/admin/groups?error=<code>` (plus `&email=<detail>` for `unknown_email`) or `?message=<code>`. Authorization is enforced only by the RPC; a 42501 from it becomes a 404 response so the route does not advertise itself (no separate `is_app_admin` pre-check).

**Contract**: Form fields `name`, `admin_emails` / `group_id`, `email`. Non-form body → `invalid_input`-style rejection without a 500, matching `signup.ts:11-17`.

#### 4. Admin page

**File**: `src/pages/admin/groups.astro` (new), small components under `src/components/groups/` as needed

**Intent**: Polish page for app admins only: create form (name + admin e-mails textarea) and a list of all groups from `admin_list_groups()` showing name, created date and admins (first name, nick, e-mail), each with an "Dodaj administratora" form (single e-mail input). Error/notice banner from query codes. Non-app-admin → `Astro.rewrite("/404")`. Plain HTML forms (no React needed); dashboard links to it when `locals.isAppAdmin`.

**Contract**: Route `/admin/groups`; meets 360 px / 44 px touch target rules from AGENTS.md; reuses existing styling of auth/dashboard cards and `Button` from `src/components/ui/button.tsx`.

#### 5. Not-found page

**File**: `src/pages/404.astro` (new)

**Intent**: A Polish "Nie znaleziono strony" page with a link back to `/dashboard`, so 404s from `/admin/groups` and `/groups/[id]` aren't a blank screen on a phone. Pages reach it with `Astro.rewrite("/404")`, which keeps the 404 status.

**Contract**: Route `/404`; same card styling as the dashboard.

#### 6. Local seed app admin

**File**: `supabase/seed.sql` (new)

**Intent**: A fixed local-only app admin (`admin@example.com`, documented password) so dev and CI smoke can sign in as app admin. See Critical Implementation Details for the required `auth.users` + `auth.identities` shape.

**Contract**: Idempotent-safe on `db reset`; inserts `auth.users`, `auth.identities`, and `public.app_admins` rows.

#### 7. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Prove the admin flow end-to-end over HTTP.

**Contract**: Write-mode steps (skipped under `SMOKE_READONLY=1`): regular smoke user gets 404 on `/admin/groups`; sign in as seed admin (`SMOKE_ADMIN_EMAIL`/`SMOKE_ADMIN_PASSWORD` env with the seed values as defaults); create group with unknown e-mail → redirect with `error=unknown_email`; create group `Smoke <timestamp>` with the smoke user's e-mail → `message=group_created`; `/admin/groups` contains the group name; sign out.

### Success Criteria:

#### Automated Verification:

- Seed loads on reset: `npx supabase db reset`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes against local dev server including the new admin steps: `npm run smoke`

#### Manual Verification:

- Signed in as the seed admin on a 360 px viewport, creating a group with two admin e-mails works without zooming or horizontal scroll, and both admins appear in the list
- Entering an unregistered e-mail shows the Polish error naming that e-mail and no group is created
- "Dodaj administratora" adds a third admin to an existing group
- Signed in as a regular user, `/admin/groups` returns 404 and the dashboard shows no admin link

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Member group views

### Overview

Members see their own groups on the dashboard and a minimal group page; isolation is visible and smoke-tested over HTTP.

### Changes Required:

#### 1. Group read service

**File**: `src/lib/services/groups.ts` (new)

**Intent**: Small read helpers used by pages, taking the SSR client.

**Contract**: `listMyGroups(supabase, userId)` → groups the user belongs to with their role, ordered by name (reads `group_members` joined to `groups`, filtered to the user's own rows). `getGroupWithAdmins(supabase, groupId, userId)` → group plus admins' `first_name`/`nick` (embedded via the `group_members → profiles` FK), or `null` when the id is not a uuid, the group is not visible, or the current user has no own `group_members` row in it. The page is members-only: an app admin who is not a member also gets `null` (RLS would let them read the group but not the admins' profiles); app admins use `/admin/groups` instead.

#### 2. Dashboard groups list

**File**: `src/pages/dashboard.astro`

**Intent**: Add a "Twoje grupy" section: each group as a link (≥44 px tall) with an "administrator" badge when the role is admin; empty state "Nie należysz jeszcze do żadnej grupy." when none; "Panel administratora" link when `locals.isAppAdmin`. Keep the greeting and sign-out.

**Contract**: Links point to `/groups/<id>`.

#### 3. Group page

**File**: `src/pages/groups/[id].astro` (new)

**Intent**: Minimal shell for later slices: group name, "Administratorzy" list (first name + nick), back link to dashboard. Rewrites to `/404` when `getGroupWithAdmins` returns `null` (non-member — including a non-member app admin — unknown or malformed id) — the same response in all cases so existence isn't leaked.

**Contract**: Route `/groups/[id]`; protected by middleware (`/groups` prefix added in Phase 2).

#### 4. Smoke isolation steps

**File**: `scripts/smoke.mjs`

**Intent**: Extend the Phase 2 flow: after the admin creates the group, the smoke user signs in, the dashboard contains the group name, the group page (id taken from the dashboard link) returns 200 and contains the group name; a second fresh user signs up and gets 404 on that group page and no group on the dashboard.

**Contract**: Write-mode only; read-only mode adds "`/groups/<random uuid>` redirects anonymous user to sign-in".

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes locally with the isolation steps: `npm run smoke`
- CI pipeline is green on the PR (db tests + smoke against preview build)

#### Manual Verification:

- On a 360 px phone viewport the dashboard group list and group page render without horizontal scroll and links are easy to tap
- A user in two groups sees both, with the "administrator" badge only where they are admin
- Pasting another group's `/groups/<id>` URL as a non-member shows 404
- Signed in as the seed app admin (not a member of the group), opening that group's `/groups/<id>` shows the 404 page, while `/admin/groups` still lists it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Hosted rollout and docs

### Overview

Make the hosted project match, grant the owner app-admin, document the procedure (resolves the roadmap unknown on how the role is granted), merge, and check production.

### Changes Required:

#### 1. Hosted database (before merge)

**Intent**: Apply the migration to the hosted Supabase project and grant the owner's account app-admin.

**Contract**: `npx supabase db push` (the seed is not pushed); then in the hosted SQL editor `insert into public.app_admins (user_id) select id from auth.users where lower(email) = lower('<owner e-mail>');`.

#### 2. README

**File**: `README.md`

**Intent**: Document roles: how to grant/revoke app-admin via SQL (local and hosted), the local seed admin credentials with a warning that the seed must never reach hosted (never `supabase db push --include-seed` or `supabase db reset --linked`), that admins are removed/demoted only via SQL in MVP, and the new routes (`/admin/groups`, `/groups/[id]`) in the routes section; mention the new smoke env vars in the Smoke test section.

**Contract**: Sections "Supabase Configuration" (new "Roles" subsection), "Auth routes", "Smoke test".

### Success Criteria:

#### Automated Verification:

- Hosted migration list matches local: `npx supabase migration list` shows the groups migration applied remotely
- Production read-only smoke passes after deploy: `SMOKE_READONLY=1 BASE_URL=<production url> npm run smoke`

#### Manual Verification:

- Before merge: the owner's hosted account is in `app_admins` and no other rows exist there
- After deploy: the owner creates a real group on production with themselves (and optionally a second parent) as admin from a phone, and it appears on their dashboard
- After deploy: another real account not in the group sees no groups and gets 404 on the group URL
- Before merge: hosted `auth.users` has no `admin@example.com` account (the local seed admin never reached production)

**Implementation Note**: The hosted steps must be done before merging the PR, because Workers Builds deploys `main` immediately; the post-deploy checks run after the merge.

---

## Testing Strategy

### Database tests (pgTAP):

- Isolation per role (app admin, group admin, member, user in another group, user in no group) across `groups`, `group_members`, `profiles`, `app_admins`.
- Write-path denial for direct DML and for RPCs called by non-app-admins.
- RPC atomicity: unknown e-mail leaves no group; duplicate/mixed-case e-mails produce a single membership; `add_group_admin` promotion and idempotency.

### Integration (smoke over HTTP):

- Admin flow: non-admin 404 on `/admin/groups`, unknown-e-mail error, successful create visible in the admin list.
- Member flow: designated admin sees the group on the dashboard and its page; an unrelated user gets 404 and an empty list; anonymous access redirects to sign-in.

### Manual Testing Steps:

1. Sign in as the seed admin, create "Judo – wtorki" with two registered e-mails; confirm both listed as admins.
2. Try an unregistered e-mail; confirm the error and that the list is unchanged.
3. Add a third admin via "Dodaj administratora".
4. Sign in as one designated admin; confirm the dashboard badge and the group page listing all admins.
5. Sign in as an unrelated user; confirm empty state and 404 on the copied group URL.

## Performance Considerations

Scale is a handful of groups; the helper functions are `stable` and backed by the `group_members` primary key and `user_id` index, which is sufficient. One extra `is_app_admin` RPC per page request is acceptable at this load.

## Migration Notes

New tables only; no backfill. Existing hosted accounts simply have no memberships. Rollback before any real groups exist = drop the three tables, the helpers, the RPCs and the `profiles_select_group_peers` policy in a follow-up migration.

## References

- Roadmap: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-004, Access Control)
- Previous slice: `context/archive/2026-11-09-signup-with-profile/plan.md`
- RLS + trigger pattern: `supabase/migrations/20261109120000_create_profiles.sql:17-58`
- pgTAP pattern: `supabase/tests/profiles_rls.test.sql`
- Error-code pattern: `src/lib/services/auth-errors.ts`
- Smoke harness: `scripts/smoke.mjs:42-83`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Group schema, app-admin role and RLS

#### Automated

- [ ] 1.1 Migration applies on a fresh local database: `npx supabase db reset`
- [ ] 1.2 All pgTAP tests pass: `npx supabase test db`
- [ ] 1.3 Lint passes: `npm run lint`

#### Manual

- [ ] 1.4 In Supabase Studio (local), a newly created group appears in `groups` and `group_members` after calling `create_group` as an app admin, and the table editor shows RLS enabled on all three new tables

### Phase 2: App-admin group management UI

#### Automated

- [ ] 2.1 Seed loads on reset: `npx supabase db reset`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Type check passes: `npx astro check`
- [ ] 2.4 Build passes: `npm run build`
- [ ] 2.5 Smoke passes against local dev server including the new admin steps: `npm run smoke`

#### Manual

- [ ] 2.6 Signed in as the seed admin on a 360 px viewport, creating a group with two admin e-mails works without zooming or horizontal scroll, and both admins appear in the list
- [ ] 2.7 Entering an unregistered e-mail shows the Polish error naming that e-mail and no group is created
- [ ] 2.8 "Dodaj administratora" adds a third admin to an existing group
- [ ] 2.9 Signed in as a regular user, `/admin/groups` returns 404 and the dashboard shows no admin link

### Phase 3: Member group views

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Type check passes: `npx astro check`
- [ ] 3.3 Build passes: `npm run build`
- [ ] 3.4 Smoke passes locally with the isolation steps: `npm run smoke`
- [ ] 3.5 CI pipeline is green on the PR (db tests + smoke against preview build)

#### Manual

- [ ] 3.6 On a 360 px phone viewport the dashboard group list and group page render without horizontal scroll and links are easy to tap
- [ ] 3.7 A user in two groups sees both, with the "administrator" badge only where they are admin
- [ ] 3.8 Pasting another group's `/groups/<id>` URL as a non-member shows 404
- [ ] 3.9 Signed in as the seed app admin (not a member of the group), opening that group's `/groups/<id>` shows the 404 page, while `/admin/groups` still lists it

### Phase 4: Hosted rollout and docs

#### Automated

- [ ] 4.1 Hosted migration list matches local: `npx supabase migration list` shows the groups migration applied remotely
- [ ] 4.2 Production read-only smoke passes after deploy: `SMOKE_READONLY=1 BASE_URL=<production url> npm run smoke`

#### Manual

- [ ] 4.3 Before merge: the owner's hosted account is in `app_admins` and no other rows exist there
- [ ] 4.4 After deploy: the owner creates a real group on production with themselves (and optionally a second parent) as admin from a phone, and it appears on their dashboard
- [ ] 4.5 After deploy: another real account not in the group sees no groups and gets 404 on the group URL
- [ ] 4.6 Before merge: hosted `auth.users` has no `admin@example.com` account (the local seed admin never reached production)
