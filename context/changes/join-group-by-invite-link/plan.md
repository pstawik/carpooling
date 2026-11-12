# Join Group by Invite Link Implementation Plan

## Overview

Roadmap slice S-03 (FR-005, FR-006, issue #6). A group admin generates the group's single invite link and can regenerate it; regeneration invalidates the previous link immediately. A signed-in user who opens the link confirms and joins; a visitor without a session goes through sign-up (or sign-in) and is joined automatically right after, without losing the link.

## Current State Analysis

- Group data model, helpers and the write pattern exist: `group_members` is written only through `security definer` RPCs that check rights themselves; RLS policies are SELECT-only (`supabase/migrations/20261110120000_create_groups.sql:45-134`, `:142-231`). Business errors are `errcode P0001` + a message key, mapped in `src/lib/services/group-errors.ts:27-43`.
- `groups` is readable by every member (`groups_select_member_or_app_admin`, tuned in `20261112120000_tune_group_policies.sql:6-8`), so an invite token stored on `groups` would be visible to all members — it needs its own table.
- `/groups/[id]` renders only the group name and admins (`src/pages/groups/[id].astro`); `getGroupWithAdmins` already loads every member row with `role`, so the caller's own role is available without a second query (`src/lib/services/groups.ts:55-79`). The page has no `?message=` notice handling yet.
- Auth endpoints always redirect to `/dashboard` on success and to `/auth/<page>?error=<code>` on failure; nothing carries a return target (`src/pages/api/auth/signup.ts:36-44`, `signin.ts:31-35`). Forms post to fixed actions (`SignUpForm.tsx:74`). The pages cross-link to each other without parameters (`signup.astro:18`, `signin.astro:27`).
- E-mail confirmation is off in every environment, so `signUp` returns a session and the join can run in the same request (README "Email confirmation is disabled everywhere").
- Middleware protects `/dashboard`, `/admin`, `/groups` (`src/middleware.ts:5`); `/join/*` must stay public.
- Tests: pgTAP in `supabase/tests/groups_rls.test.sql` (`plan(55)`), dependency-free HTTP smoke in `scripts/smoke.mjs` with a "stranger" account and `SMOKE_READONLY=1` for production. Local seed app admin in `supabase/seed.sql`.
- pgcrypto lives in the `extensions` schema (used as `extensions.crypt` by the S-02 seed).

## Desired End State

- On `/groups/<id>` a group admin sees an "Link zaproszeniowy" section: before the first link a "Wygeneruj link" button; afterwards the full URL in a read-only field, a "Kopiuj" button, and "Wygeneruj nowy link" (with a confirmation that the old link stops working). Non-admin members do not see the section and cannot read the token through any API.
- `/join/<token>`:
  - invalid/regenerated token → friendly "Ten link jest nieaktualny — poproś administratora grupy o nowy." with HTTP 404;
  - no session → "Zaproszenie do grupy „<name>”" with "Załóż konto" (primary) and "Mam konto — zaloguj się", both carrying `?invite=<token>`;
  - signed in → group name and a "Dołącz do grupy" button (POST).
- Joining lands on `/groups/<id>?message=joined` ("Dołączyłeś do grupy"); an existing member/admin lands on `/groups/<id>?message=already_member` ("Już jesteś członkiem tej grupy") and their role is unchanged.
- Sign-up or sign-in started from an invite joins the group on success and redirects to the group page; validation/auth errors keep `?invite=` so a retry still joins.
- Verified by pgTAP, smoke (end-to-end for new user, existing user, already-member, regenerated link), and manual checks at 360 px.

### Key Discoveries:

- Write-path pattern to copy: `add_group_admin` (`create_groups.sql:198-231`) — permission check, `P0001` business error, `on conflict` upsert, `revoke … from public, anon` + `grant … to authenticated` (`:270-275`).
- Helper pattern to copy for `is_group_admin`: `is_group_member` (`create_groups.sql:75-87`), `security definer`, `set search_path = ''`; call it inside `(select …)` in policies (`tune_group_policies.sql`).
- Error/notice mapping to extend: `ERROR_MESSAGES`, `NOTICE_MESSAGES`, `RPC_ERROR_KEYS`, `groupRpcFailure` (`group-errors.ts:8-43`).
- Endpoint shape to copy: `src/pages/api/admin/groups.ts` (formData try/catch → zod → `createClient` → rpc → `groupRpcFailure` → redirect; 42501 → `context.rewrite("/404")`).
- Smoke reads ids out of rendered HTML (`dashboardWithGroupLink`, `smoke.mjs:66-74`); the invite token can be read from the group page the same way.

## What We're NOT Doing

- No expiry dates, per-user invites, usage limits or e-mail invites (PRD Non-Goals; v2).
- No member removal (FR-007, parked) and no member list (FR-009, parked).
- No change to `create_group` and no backfill: a group has no link until its admin asks for one.
- No invite management by the app admin who is not a group admin; app admin rights stay as in S-02.
- No join on GET — opening a link never changes data.
- No "return to" handling for protected routes in general (only the invite flow carries a target).
- No Web Share API; copy-to-clipboard only.

## Implementation Approach

Database first, following the S-02 pattern: one migration adds `group_invites` (RLS, admin-only SELECT, no client writes), an `is_group_admin` helper and three RPCs; pgTAP proves isolation and regeneration. Then the UI in three slices that each verify on their own: the admin panel, the join page for signed-in users, and threading `invite` through sign-up/sign-in with end-to-end smoke. Finally hosted rollout before merge, because Workers Builds deploys `main` immediately.

## Critical Implementation Details

- **Token encoding:** generate with `extensions.gen_random_bytes(24)`, then `encode(…, 'base64')` and translate `+/` → `-_` (24 bytes → 32 chars, no `=` padding). Validate in zod with `^[A-Za-z0-9_-]{32}$`; a malformed token is treated exactly like an unknown one (404 page), never as a 400.
- **Anon RPC:** `invite_group_name` is the first function granted to `anon`. It must return only the name (or null) — not the group id or anything else — because the anonymous page needs nothing more.
- **Order in auth endpoints:** join only after `signUp`/`signInWithPassword` succeeded, using the same SSR client (its session cookies are already set on `context.cookies`). If the join RPC reports `invalid_invite`, redirect the now-signed-in user to `/join/<token>` (which renders the "nieaktualny" state); any other RPC error → log and redirect to `/dashboard`. A sign-up never fails because of the invite.
- **Link URL:** build it from `Astro.url.origin` + `/join/<token>` on the server so local, preview and production each show their own host.
- **Tokens in logs:** `/join/<token>` and `?invite=<token>` appear in Workers request logs (observability is on in `wrangler.jsonc`). Accepted — same trust level as a forwarded link (PRD FR-005); regeneration is the remedy. Never log the token explicitly in `console.error` calls.

## Phase 1: Invite schema, RPCs and pgTAP

### Overview

One migration with the table, helper, RPCs and policies, plus a pgTAP test. No app code.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261112130000_create_group_invites.sql` (new)

**Intent**: Store one invite token per group, readable only by that group's admins, writable only through RPCs; expose the join and the anonymous name lookup.

**Contract**:
- Table `public.group_invites (group_id uuid primary key references public.groups(id) on delete cascade, token text not null unique, created_by uuid null references auth.users(id) on delete set null, created_at timestamptz not null default now())`.
- RLS enabled; `revoke all … from anon`; `revoke insert, update, delete, truncate … from authenticated`; policy `group_invites_select_group_admin` for `select` to `authenticated` using `public.is_group_admin(group_id)` (unwrapped, like `is_group_member(id)`; the `(select …)` initPlan trick only helps argument-free calls).
- Helper `public.is_group_admin(p_group_id uuid) returns boolean` — same shape as `is_group_member`, plus `role = 'admin'`; executable by `authenticated` only.
- `public.regenerate_group_invite(p_group_id uuid) returns text` — 42501 `insufficient_privilege` unless caller is that group's admin; upserts a fresh token (`on conflict (group_id) do update set token, created_by, created_at`) and returns it. `authenticated` only.
- `public.invite_group_name(p_token text) returns text` — `stable`; name of the group for a valid token, else null. Granted to `anon` and `authenticated`.
- `public.join_group_by_invite(p_token text) returns table (group_id uuid, already_member boolean)` — requires `auth.uid()` (42501 otherwise); unknown token → `P0001 invalid_invite`; inserts `(group_id, auth.uid(), 'member') on conflict do nothing`; `already_member` true when the row already existed (role untouched). `authenticated` only.

#### 2. pgTAP test

**File**: `supabase/tests/group_invites_rls.test.sql` (new)

**Intent**: Prove isolation and regeneration semantics that the UI relies on.

**Contract**: Asserts at least: RLS enabled and exact policy list on `group_invites`; group admin can select its token, a plain member and a stranger get 0 rows, anon has no table privileges; direct insert/update/delete as `authenticated` fail; `regenerate_group_invite` by a member/stranger → 42501, by admin returns a 32-char token and a second call returns a different token; `join_group_by_invite` with the old token → `invalid_invite`, with the new token adds a `member` row and `already_member = false`; second join → `already_member = true`; an admin joining their own group stays `admin`; `invite_group_name` as anon returns the name for a valid token and null for an unknown one; anon cannot execute `join_group_by_invite` or `regenerate_group_invite`.

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local DB: `npx supabase db reset`
- All pgTAP tests pass, including the new file: `npx supabase test db`

#### Manual Verification:

- In local Studio, `group_invites` shows RLS enabled with exactly one SELECT policy and no write grants for `anon`/`authenticated`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Admin invite panel

### Overview

Group admins generate, regenerate and copy the link on `/groups/[id]`; the group page learns to show notices.

### Changes Required:

#### 1. Service

**File**: `src/lib/services/groups.ts`, `src/lib/services/invites.ts` (new)

**Intent**: Expose the caller's role in the group and the admin's current invite token.

**Contract**: `GroupWithAdmins` gains `myRole: GroupRole` (taken from the already-loaded member rows). `invites.ts`: `getGroupInviteToken(supabase, groupId): Promise<string | null>` (select from `group_invites`; RLS returns nothing for non-admins), `inviteTokenSchema` (zod regex from Critical Implementation Details) in `src/lib/validation/invites.ts`.

#### 2. Regenerate endpoint

**File**: `src/pages/api/groups/invite.ts` (new)

**Intent**: Create or replace the group's link.

**Contract**: `POST` form `group_id` (uuid). Calls `regenerate_group_invite`. Success → `/groups/<id>?message=invite_ready`; 42501 or invalid id → `context.rewrite("/404")`; other errors → log, `/groups/<id>?error=unknown`. No session → `/auth/signin`.

#### 3. Notices and errors

**File**: `src/lib/services/group-errors.ts`

**Intent**: Polish texts for the new codes.

**Contract**: Notices `invite_ready` "Link zaproszeniowy gotowy", `joined` "Dołączyłeś do grupy", `already_member` "Już jesteś członkiem tej grupy"; error key `invalid_invite` added to `RPC_ERROR_KEYS` and `ERROR_MESSAGES` ("Ten link jest nieaktualny — poproś administratora grupy o nowy").

#### 4. Invite panel UI

**File**: `src/pages/groups/[id].astro`, `src/components/groups/InvitePanel.tsx` (new)

**Intent**: Admin-only section; notices for every member.

**Contract**: The page renders `?message=` / `?error=` via the helpers (same `role="status"` banner style as `signin.astro:16-23`). When `myRole === "admin"`: no token → Astro form with "Wygeneruj link"; token present → `InvitePanel` island with props `url` and `groupId`: read-only input with the URL, "Kopiuj" (`navigator.clipboard.writeText`, label switches to "Skopiowano"; on failure selects the input text), and a "Wygeneruj nowy link" form whose submit asks `window.confirm("Poprzedni link przestanie działać. Kontynuować?")`. All buttons ≥ 44 px; input wraps without horizontal scroll at 360 px.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Existing smoke still passes: `npm run smoke`

#### Manual Verification:

- As a group admin at 360 px: generate a link, copy it, regenerate (confirm dialog shown, URL changes) — no zoom or horizontal scroll needed
- As a plain member of the same group the section is absent

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Join page for signed-in users

### Overview

The public `/join/<token>` page in its three states and the join endpoint.

### Changes Required:

#### 1. Join page

**File**: `src/pages/join/[token].astro` (new)

**Intent**: Show what the visitor is invited to and offer the right next step.

**Contract**: Public route (not in `PROTECTED_ROUTES`). Malformed token or `invite_group_name` null → render the "nieaktualny" card with `Astro.response.status = 404` and a link to `/` (or `/dashboard` when signed in). Valid + no session → group name, "Załóż konto" → `/auth/signup?invite=<token>`, "Mam konto — zaloguj się" → `/auth/signin?invite=<token>`. Valid + session → group name and a POST form to `/api/groups/join` with hidden `token`, button "Dołącz do grupy". Same card styling as the auth pages.

#### 2. Join endpoint

**File**: `src/pages/api/groups/join.ts` (new), shared helper in `src/lib/services/invites.ts`

**Intent**: Perform the join and redirect.

**Contract**: `POST` form `token`. Malformed token (fails `inviteTokenSchema`) → fixed `/join/invalid` (fails the regex, so it renders the "nieaktualny" 404); raw input is never echoed into a redirect. No session → `/auth/signin?invite=<token>` (well-formed token only). `invalid_invite` → `/join/<token>`. Success → `/groups/<id>?message=joined` or `?message=already_member`. Other errors → log, `/dashboard`. Shared helper `joinByInvite(supabase, token): Promise<{ kind: "joined" | "already_member"; groupId: string } | { kind: "invalid" } | { kind: "error" }>` plus `joinRedirect(result, token): string`, reused by the auth endpoints in Phase 4.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Existing smoke still passes: `npm run smoke`

#### Manual Verification:

- A second signed-in user opens the copied link at 360 px, sees the group name, taps "Dołącz do grupy" and lands on the group page with "Dołączyłeś do grupy"; the group appears on their dashboard
- Opening the link again shows the group page with "Już jesteś członkiem tej grupy"; the admin opening the link stays admin
- After the admin regenerates, the old link shows the "nieaktualny" page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Invite through sign-up/sign-in and end-to-end smoke

### Overview

Carry `invite` through both auth screens and endpoints, join right after successful auth, and cover the whole flow in smoke.

### Changes Required:

#### 1. Auth pages and forms

**File**: `src/pages/auth/signup.astro`, `src/pages/auth/signin.astro`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/SignInForm.tsx`

**Intent**: Keep the token visible to the endpoint and across the sign-up ↔ sign-in links.

**Contract**: Pages read `?invite=`, keep it only if it passes `inviteTokenSchema`, pass it as an optional `invite` prop; forms render `<input type="hidden" name="invite">` when set. Cross-links become `/auth/signin?invite=<token>` / `/auth/signup?invite=<token>` when present. When an invite is present, the page shows a short line "Po rejestracji/zalogowaniu dołączysz do grupy." (no group name needed).

#### 2. Auth endpoints

**File**: `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signin.ts`

**Intent**: Join after successful auth; never lose the token on an error redirect.

**Contract**: Read `invite` from the form and validate with `inviteTokenSchema` separately from `signUpSchema`/`signInSchema` (an invalid value is dropped, never an error). Error redirects append `&invite=<token>` when valid. On success with a token → `joinByInvite` + `joinRedirect` (see Critical Implementation Details); without a token → unchanged `/dashboard`. The `account_created` fallback (no session) keeps `?invite=` on the sign-in redirect.

#### 3. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Prove FR-005/FR-006 end-to-end over HTTP.

**Contract**: Read-only step: `GET /join/<32 random url-safe chars>` → 404. Write steps (after the existing designated-admin steps, before the stranger steps): admin POSTs `/api/groups/invite` → `?message=invite_ready`; token read from the group page HTML; anon `GET /join/<token>` → 200 containing the group name; existing stranger isolation steps stay as-is (404 before joining); a new user signs up with `invite` → redirect to `/groups/<id>?message=joined`, group page 200; the stranger signs in with `invite` → `?message=joined`; stranger POSTs `/api/groups/join` again → `?message=already_member`; admin regenerates; a POST join with the old token → redirect `/join/<old token>`, which returns 404.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes locally with the invite steps: `npm run smoke`
- CI pipeline is green on the PR (db tests + smoke)

#### Manual Verification:

- In a private window at 360 px: open an invite link, tap "Załóż konto", submit once with an already-registered e-mail (server error), fix it and submit — you land in the group with "Dołączyłeś do grupy"
- Same with "Mam konto — zaloguj się" using a wrong password first, then the right one
- Plain sign-up and sign-in without an invite still land on `/dashboard`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Hosted rollout and docs

### Overview

Apply the migration to the hosted project before merging and document the flow.

### Changes Required:

#### 1. Hosted database

**File**: hosted Supabase project (no repo file)

**Intent**: Production must have the table and RPCs before Workers Builds deploys `main`.

**Contract**: `npx supabase db push` (seed is never pushed); `npx supabase migration list` shows Local and Remote in sync.

#### 2. README

**File**: `README.md`

**Intent**: Document the invite flow and new routes.

**Contract**: Routes section gains `/join/[token]`, `POST /api/groups/invite`, `POST /api/groups/join`; a short "Invite links" subsection (one link per group, regeneration invalidates the old one, anonymous page shows only the group name, `?invite=` threads through auth); Smoke test section mentions the invite steps.

### Success Criteria:

#### Automated Verification:

- Migrations are in sync with hosted: `npx supabase migration list`
- Production read-only smoke passes after deploy: `SMOKE_READONLY=1 BASE_URL=<production url> npm run smoke`

#### Manual Verification:

- In production, the author generates a link for a real group and a second account joins through it
- README describes the invite flow and new routes

**Implementation Note**: 5.1 (hosted migrations in sync) and 5.4 (README) gate the merge to `main` — Workers Builds deploys on merge, so the hosted DB must be ready first. 5.2 (production read-only smoke) and 5.3 (real join in production) are post-merge checks run right after the deploy; if either fails, fix forward or revert the merge.

---

## Testing Strategy

### Database tests (pgTAP):

- Token visibility: admin yes; member, stranger, anon no.
- Regeneration: new token differs, old token rejected by `join_group_by_invite`.
- Join: new member gets `member`; repeated join is idempotent; admin role never downgraded.
- Anonymous lookup returns only a name or null.

### Integration (smoke over HTTP):

- Anonymous invite page, sign-up with invite, sign-in with invite, already-member, regenerated link, malformed token (read-only).

### Manual Testing Steps:

1. As group admin, generate and copy the link on a 360 px phone viewport.
2. In a private window, open it, sign up (with one failed attempt first), land in the group.
3. As an existing user, open it, sign in, land in the group.
4. Open it again → "Już jesteś członkiem tej grupy".
5. Regenerate; the old link shows "nieaktualny".

## Performance Considerations

Negligible: one indexed lookup by token (unique index) per join; the group page adds one small select for admins only.

## Migration Notes

Additive migration; no backfill (groups get a link on first admin request). Rollback = drop the table and the four functions; no existing data changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-03), PRD FR-005, FR-006, Access Control
- Prior pattern: `context/archive/2026-11-10-app-admin-creates-group/plan.md`
- RPC/RLS pattern: `supabase/migrations/20261110120000_create_groups.sql:75-87`, `:198-275`
- Endpoint pattern: `src/pages/api/admin/groups.ts`
- Error mapping: `src/lib/services/group-errors.ts:8-43`
- Smoke harness: `scripts/smoke.mjs:66-74`, `:76-152`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Invite schema, RPCs and pgTAP

#### Automated

- [x] 1.1 Migration applies on a clean local DB: `npx supabase db reset`
- [x] 1.2 All pgTAP tests pass, including the new file: `npx supabase test db`

#### Manual

- [x] 1.3 In local Studio, `group_invites` shows RLS enabled with exactly one SELECT policy and no write grants for `anon`/`authenticated`

### Phase 2: Admin invite panel

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Type check passes: `npx astro check`
- [ ] 2.3 Build passes: `npm run build`
- [ ] 2.4 Existing smoke still passes: `npm run smoke`

#### Manual

- [ ] 2.5 As a group admin at 360 px: generate a link, copy it, regenerate (confirm dialog shown, URL changes) — no zoom or horizontal scroll needed
- [ ] 2.6 As a plain member of the same group the section is absent

### Phase 3: Join page for signed-in users

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Type check passes: `npx astro check`
- [ ] 3.3 Build passes: `npm run build`
- [ ] 3.4 Existing smoke still passes: `npm run smoke`

#### Manual

- [ ] 3.5 A second signed-in user opens the copied link at 360 px, sees the group name, taps "Dołącz do grupy" and lands on the group page with "Dołączyłeś do grupy"; the group appears on their dashboard
- [ ] 3.6 Opening the link again shows the group page with "Już jesteś członkiem tej grupy"; the admin opening the link stays admin
- [ ] 3.7 After the admin regenerates, the old link shows the "nieaktualny" page

### Phase 4: Invite through sign-up/sign-in and end-to-end smoke

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Type check passes: `npx astro check`
- [ ] 4.3 Build passes: `npm run build`
- [ ] 4.4 Smoke passes locally with the invite steps: `npm run smoke`
- [ ] 4.5 CI pipeline is green on the PR (db tests + smoke)

#### Manual

- [ ] 4.6 In a private window at 360 px: open an invite link, tap "Załóż konto", submit once with an already-registered e-mail (server error), fix it and submit — you land in the group with "Dołączyłeś do grupy"
- [ ] 4.7 Same with "Mam konto — zaloguj się" using a wrong password first, then the right one
- [ ] 4.8 Plain sign-up and sign-in without an invite still land on `/dashboard`

### Phase 5: Hosted rollout and docs

#### Automated

- [ ] 5.1 Migrations are in sync with hosted: `npx supabase migration list`
- [ ] 5.2 Production read-only smoke passes after deploy: `SMOKE_READONLY=1 BASE_URL=<production url> npm run smoke`

#### Manual

- [ ] 5.3 In production, the author generates a link for a real group and a second account joins through it
- [ ] 5.4 README describes the invite flow and new routes
