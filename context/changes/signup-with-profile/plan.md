# Signup with Profile and Long Session Implementation Plan

## Overview

Roadmap slice S-01 (FR-001, FR-002, issue #4). Registration collects first name, nick, e-mail, password and an optional phone number; the profile is stored in a new `public.profiles` table (the project's first migration, with RLS); a successful signup signs the user in immediately and the session lasts until the user signs out. Auth screens switch to Polish, which becomes the UI language convention for later slices.

## Current State Analysis

- Signup collects only e-mail + password and redirects to a "check your e-mail" page: `src/pages/api/auth/signup.ts:5-20`, `src/pages/auth/confirm-email.astro`.
- Endpoints read form fields with `as string` casts and no validation (`signup.ts:6-7`, `signin.ts:6-7`); zod is only a transitive dependency (`package-lock.json`), despite AGENTS.md requiring zod at API boundaries.
- No database schema: `supabase/migrations/` does not exist; only `supabase/config.toml`.
- Session handling: `src/lib/supabase.ts` builds the `@supabase/ssr` server client with cookie get/set; `src/middleware.ts:8-15` calls `auth.getUser()` on every request (which refreshes an expired access token and rewrites cookies). `supabase/config.toml:255-259` leaves `[auth.sessions]` commented out (no timebox, no inactivity timeout); `enable_refresh_token_rotation = true` (`config.toml:164`).
- E-mail confirmation: off locally (`config.toml:209`), on in the hosted project — which is why the production smoke runs `SMOKE_READONLY=1` (`scripts/smoke.mjs:38-40`, README "Smoke test").
- UI is English: `src/layouts/Layout.astro:14` (`lang="en"`), `SignUpForm.tsx`, `SignInForm.tsx`, `signup.astro`, `signin.astro`, `dashboard.astro`; `Topbar.astro:8` and `dashboard.astro` display `user.email`.
- CI `smoke` job runs `supabase start` (applies `supabase/migrations/` automatically) and `npm run smoke` against the production preview (`.github/workflows/ci.yml:27-56`).

## Desired End State

- A new user opens `/auth/signup` on a phone, fills in Imię, Nick, E-mail, Telefon (opcjonalnie), Hasło, Powtórz hasło, submits, and lands on `/dashboard` already signed in, greeted by first name and shown their nick.
- `public.profiles` holds exactly one row per `auth.users` row created through signup, written atomically by a trigger; an authenticated user can read only their own row; nobody can insert/update/delete profile rows through the API.
- Invalid input (missing name/nick, bad e-mail, short password, malformed phone) is rejected server-side by zod with a Polish message, even when the client is bypassed.
- The session survives closing the browser and stays valid until the user clicks "Wyloguj" (no timebox, no inactivity timeout).
- Hosted Supabase has e-mail confirmation disabled and the migration applied; `npm run smoke` passes locally and in CI, and the read-only smoke passes against production.

### Key Discoveries:

- Supabase's documented pattern for profile data is `signUp({ options: { data } })` + an `after insert on auth.users` trigger copying `raw_user_meta_data`; an API-side insert would fail under RLS whenever no session is returned.
- `supabase start` applies migrations and `supabase test db` runs pgTAP files from `supabase/tests/` — usable in the existing CI `smoke` job without new services.
- `@supabase/ssr` sets auth cookies with a long `maxAge` by default; combined with no `[auth.sessions]` limits, "until sign-out" needs no new code — only verification and documentation.
- Workers Builds auto-deploys `main` (README "Deployment"), so hosted DB/auth changes must precede the merge.

## What We're NOT Doing

- Profile editing, password reset, app-admin role (PRD Non-Goals / S-02).
- Showing profiles to other users — the "shares a group" SELECT policy arrives with groups in S-02+.
- Nick uniqueness (decided: nick is a free display name, duplicates allowed).
- Strict E.164 / Polish-only phone formats (decided: lenient, normalized).
- An i18n framework; strings are hard-coded Polish.
- Repopulating form fields after a server-side error redirect (client-side validation with the same zod schema catches field errors before submit; only server errors like "e-mail taken" clear the form).
- Translating the starter landing content (`index.astro`, `Welcome.astro`, `Banner.astro`).
- Session timeouts (`[auth.sessions]` stays unset; it is also a paid hosted feature).

## Implementation Approach

Database first: the migration defines the profile contract (columns, checks, trigger, RLS) and a pgTAP test proves isolation, so later phases build on a verified schema. Then the server boundary (zod schemas shared with the client, signup passing metadata, auto sign-in, Polish error mapping) with the smoke test extended to prove the trigger end-to-end. Then the UI on top of that contract. Finally, the hosted environment is aligned (confirmation off, migration pushed) **before** the branch merges, and docs record the decisions.

## Critical Implementation Details

- **Deploy ordering:** Phase 4's hosted steps (disable confirmation, `supabase db push`) must be done before the PR merges to `main`, because Workers Builds deploys immediately; otherwise production signups either land on the "konto utworzone, zaloguj się" fallback or the middleware queries a missing `profiles` table.
- **Trigger strictness:** the trigger must fail (and therefore abort the `auth.users` insert) when `first_name` or `nick` metadata is missing, so profile-less accounts cannot exist; users created by hand in Studio must supply that metadata.

## Phase 1: Profile schema and RLS

### Overview

Create `public.profiles`, the signup trigger, and RLS; prove isolation with a pgTAP test that runs in CI.

### Changes Required:

#### 1. Profiles migration

**File**: `supabase/migrations/20261109120000_create_profiles.sql`

**Intent**: Introduce the profile record every later table references, enforcing the field rules in the database and deny-by-default access.

**Contract**:
- Table `public.profiles`: `id uuid primary key references auth.users(id) on delete cascade`, `first_name text not null` (trimmed length 1–50), `nick text not null` (trimmed length 1–30, not unique), `phone text null` (check `phone ~ '^\+?[0-9]{9,15}$'`), `created_at timestamptz not null default now()`.
- `alter table public.profiles enable row level security;` in the same migration.
- Policies: `profiles_select_own` — `for select to authenticated using (id = (select auth.uid()))`. No INSERT/UPDATE/DELETE policies for `anon` or `authenticated` (writes happen only through the trigger); also `revoke insert, update, delete on public.profiles from anon, authenticated` so intent is explicit. A comment in the file states that S-02 adds a group-sharing SELECT policy.
- Function `public.handle_new_user()` — `security definer`, `set search_path = ''`, inserts `id`, `trim(raw_user_meta_data->>'first_name')`, `trim(raw_user_meta_data->>'nick')`, `nullif(trim(raw_user_meta_data->>'phone'), '')`; trigger `on_auth_user_created after insert on auth.users for each row`.

#### 2. RLS test

**File**: `supabase/tests/profiles_rls.test.sql`

**Intent**: Repeatable proof of the access rules; seeds the pattern S-02 extends for group isolation.

**Contract**: pgTAP test that creates two users via `auth.users` inserts with metadata, then asserts: trigger created both profile rows with trimmed values and NULL phone for empty string; insert without `nick` metadata raises; as user A (`set local role authenticated` + `request.jwt.claims`) selects only A's row; `anon` sees zero rows; A cannot update/delete/insert profiles; malformed phone is rejected by the check.

#### 3. CI step

**File**: `.github/workflows/ci.yml`

**Intent**: Run the DB tests on every PR.

**Contract**: In the `smoke` job, after "Start local Supabase", add a step `supabase test db`.

#### 4. Shared type

**File**: `src/types.ts` (new)

**Intent**: Single DTO for the profile used by middleware and pages.

**Contract**: `export interface Profile { id: string; first_name: string; nick: string; phone: string | null; created_at: string }`.

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local DB: `npx supabase db reset`
- RLS/trigger tests pass: `npx supabase test db`
- Lint and type checks pass: `npm run lint` and `npx astro check`

#### Manual Verification:

- In local Studio, `profiles` shows RLS enabled with only the `profiles_select_own` policy

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Signup/signin API with zod validation

### Overview

Validate auth input with zod, pass profile metadata to Supabase, sign the user in on signup, map errors to Polish, and extend the smoke test.

### Changes Required:

#### 1. Dependency

**File**: `package.json`

**Intent**: Make zod a direct dependency, as AGENTS.md requires.

**Contract**: `npm install zod` (v4, matching the version already in the lockfile).

#### 2. Auth schemas

**File**: `src/lib/validation/auth.ts` (new)

**Intent**: One source of truth for field rules, importable by both endpoints and the React form (no secrets involved).

**Contract**:
- `signUpSchema`: `first_name` trimmed 1–50, `nick` trimmed 1–30, `email` valid e-mail (trimmed, lowercased), `password` min 6 (matches Supabase minimum), `phone` optional — empty string → `undefined`; otherwise strip spaces, `-`, `(`, `)`, keep a single leading `+`, then require `^\+?[0-9]{9,15}$` (same rule as the DB check). Polish error messages per field.
- `signInSchema`: `email`, `password` non-empty.
- Exported inferred types `SignUpInput`, `SignInInput`.
- The `confirmPassword` match stays client-only (not sent semantics); server ignores it.

#### 3. Error mapping

**File**: `src/lib/services/auth-errors.ts` (new)

**Intent**: Show Polish messages instead of raw Supabase English text.

**Contract**: `toPolishAuthError(error: AuthError): string` mapping by `error.code` — `user_already_exists`/`email_exists` → "Konto z tym adresem e-mail już istnieje", `invalid_credentials` → "Nieprawidłowy e-mail lub hasło", `weak_password` → "Hasło jest za słabe", `over_request_rate_limit`/`over_email_send_rate_limit` → "Za dużo prób, spróbuj za chwilę", default → "Coś poszło nie tak, spróbuj ponownie". Also a constant for "Supabase nie jest skonfigurowany".

#### 4. Signup endpoint

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Validate, create the account with profile metadata, and sign the user in.

**Contract**: `POST` parses form data with `signUpSchema.safeParse`; failure → redirect `/auth/signup?error=<first issue message>`. Calls `supabase.auth.signUp({ email, password, options: { data: { first_name, nick, phone } } })`. Error → redirect `/auth/signup?error=<toPolishAuthError>`. `data.session` present → redirect `/dashboard`; absent (confirmation still on somewhere) → redirect `/auth/signin?message=Konto utworzone — zaloguj się`.

#### 5. Signin endpoint

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Same validation and Polish errors; land on the dashboard.

**Contract**: `signInSchema.safeParse`; errors via `toPolishAuthError`; success → redirect `/dashboard` (was `/`).

#### 6. Remove confirm-email page

**File**: `src/pages/auth/confirm-email.astro` (delete)

**Intent**: The flow no longer ends on a "check your e-mail" page.

**Contract**: Route `/auth/confirm-email` removed; no remaining references (`grep -r confirm-email src scripts`).

#### 7. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Prove the whole S-01 flow, including the profile trigger, over HTTP.

**Contract**:
- `request()` optionally returns the response body; step expectations accept an optional `contains` string.
- Write steps become: "signup rejects missing nick" (302 → `/auth/signup?error=`), "signup creates account and signs in" (form with `first_name`, `nick: "Smoke"`, `phone: "600 123 456"`, email, password → 302 `/dashboard`), "dashboard renders right after signup" (200), "signout clears session", "signin rejects wrong password", "signin accepts correct password" (302 `/dashboard`), "dashboard renders for signed-in user", "signout clears session", "dashboard redirects after signout".
- Read-only steps unchanged.
- The nick-content assertion is deliberately deferred to Phase 3, where the dashboard starts rendering profile data.

### Success Criteria:

#### Automated Verification:

- Lint and type checks pass: `npm run lint` and `npx astro check`
- Build succeeds: `npm run build`
- Smoke passes against local dev server with local Supabase: `npm run smoke`
- No references to the removed page: `grep -r "confirm-email" src scripts` returns nothing

#### Manual Verification:

- A POST to `/api/auth/signup` with a malformed phone (e.g. `abc`) via curl redirects with a Polish error and creates no user

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Polish auth UI and profile display

### Overview

Add the profile fields to the signup form, translate auth screens to Polish, load the profile into `locals`, and show the nick/name.

### Changes Required:

#### 1. Form field primitive

**File**: `src/components/auth/FormField.tsx`

**Intent**: Support mobile keyboards/autofill and 44 px touch targets.

**Contract**: Add optional `autoComplete` and `inputMode` props passed to `<input>`; input height at least 44 px (`min-h-11`), merged with `cn()`.

#### 2. Signup form

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Collect the profile fields with the same rules as the server.

**Contract**: Fields in order: `first_name` "Imię" (`autoComplete="given-name"`), `nick` "Nick" (hint "Widoczny dla innych rodziców w grupie"), `email` "E-mail", `phone` "Telefon (opcjonalnie)" (`type="tel"`, `inputMode="tel"`, hint "Widoczny tylko dla członków Twoich grup"), `password` "Hasło", `confirmPassword` "Powtórz hasło". Client validation uses `signUpSchema` plus the confirm-password match; all labels, placeholders, hints, button ("Załóż konto" / "Tworzenie konta...") in Polish.

#### 3. Signin form and pages

**Files**: `src/components/auth/SignInForm.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/SubmitButton.tsx`, `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: Polish copy throughout the auth flow.

**Contract**: Titles "Logowanie" / "Rejestracja", links "Nie masz konta? Zarejestruj się" / "Masz już konto? Zaloguj się", aria-labels in Polish; `signin.astro` also renders the `message` query param (from the signup fallback) as a neutral notice. Signin client validation uses `signInSchema`.

#### 4. Profile in locals

**Files**: `src/middleware.ts`, `src/env.d.ts`

**Intent**: Make the signed-in user's profile available to every page without per-page queries.

**Contract**: `App.Locals` gains `profile: Profile | null`. When `user` is set, middleware selects the own row from `profiles` (`.maybeSingle()`); on error or no row, `profile = null` (pages fall back to e-mail). Anonymous requests skip the query.

#### 5. Profile display and language

**Files**: `src/components/Topbar.astro`, `src/pages/dashboard.astro`, `src/layouts/Layout.astro`

**Intent**: Show who is signed in using profile data; declare Polish.

**Contract**: The dashboard is the post-login screen: it greets "Cześć, {first_name}!", shows the nick (e.g. "Twój nick: {nick}"; fallback `user.email` when `profile` is null) and has the "Wyloguj" button. Topbar (rendered only on the landing page `/` via `Welcome.astro`) shows `profile.nick` (fallback `user.email`) with Polish labels; it is not added to `/dashboard` in this slice. `Layout.astro` sets `lang="pl"`.

#### 6. Smoke nick assertion

**File**: `scripts/smoke.mjs`

**Intent**: Prove the trigger → profile → page chain end-to-end once the dashboard renders profile data.

**Contract**: The "dashboard renders right after signup" step additionally expects the body to contain `Smoke` (the signup nick); rename it "dashboard shows profile nick".

### Success Criteria:

#### Automated Verification:

- Lint and type checks pass: `npm run lint` and `npx astro check`
- Build succeeds: `npm run build`
- Smoke passes against local dev server, including "dashboard shows profile nick": `npm run smoke`

#### Manual Verification:

- At 360 px viewport (devtools), signup, signin and dashboard have no horizontal scroll and all inputs/buttons are at least 44 px tall
- Submitting signup with empty Imię/Nick or phone "12" shows Polish inline errors without a request
- Signup with a valid optional phone, then without a phone, both land on `/dashboard` with "Cześć, <imię>!" and the nick shown on the dashboard
- Signing up with an already-registered e-mail shows "Konto z tym adresem e-mail już istnieje"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Hosted rollout and docs

### Overview

Align the hosted Supabase project with the decisions (confirmation off, migration applied), document session behavior, and update the README — all before merging to `main`.

### Changes Required:

#### 1. Session decision in config

**File**: `supabase/config.toml`

**Intent**: Record that the long session is intentional, so nobody "fixes" it later.

**Contract**: Comment above the commented `[auth.sessions]` block: FR-002 — sessions last until sign-out; no timebox/inactivity timeout by design. No functional setting change.

#### 2. Hosted Supabase (manual, no file)

**Intent**: Make production behave like local and CI.

**Contract**: Dashboard → Authentication → Sign In / Providers → Email → "Confirm email" off; verify minimum password length is 6; `npx supabase link` (if not linked) and `npx supabase db push` to apply `20261109120000_create_profiles.sql`; check existing hosted users without a profile row (pre-S-01 test accounts) and delete them.

#### 3. README

**File**: `README.md`

**Intent**: Keep setup and deploy docs true.

**Contract**: Replace "Email confirmation in local development" with a section stating confirmation is disabled in all environments (PRD: no e-mails; FR-006 auto-join); remove `/auth/confirm-email` from the routes table; add "Database migrations" steps (`npx supabase db reset` locally, `npx supabase test db`, `npx supabase db push` before merging migration PRs); note session lasts until sign-out; mention `supabase test db` in the CI section.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Hosted migration is applied: `npx supabase migration list` shows `20261109120000` in both Local and Remote columns

#### Manual Verification:

- Hosted dashboard shows "Confirm email" disabled and minimum password length 6
- Roadmap question #13 (issue #13) is closed with the decision "confirmation disabled"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Only after this phase is the PR merged to `main`.

---

## Phase 5: Post-deploy verification

### Overview

After the PR merges and Workers Builds deploys `main`, verify the S-01 outcome in production. No code changes; if a check fails, fix it in a follow-up commit on a new branch.

### Changes Required:

None — verification only.

### Success Criteria:

#### Automated Verification:

- Read-only production smoke passes: `BASE_URL=https://carpooling.pstawik.workers.dev SMOKE_READONLY=1 npm run smoke`

#### Manual Verification:

- On a real phone against production: sign up with name, nick and phone, land on the dashboard signed in, and see the greeting and nick there
- Close the browser, reopen the site the next day: still signed in; auth cookie expiry in devtools is months away, not session-only
- "Wyloguj" ends the session and `/dashboard` redirects to sign-in

---

## Testing Strategy

### Unit Tests:

- None (no unit-test framework in the project). Field rules are covered by the pgTAP test (DB side) and smoke/manual checks (app side).

### Integration Tests:

- `supabase/tests/profiles_rls.test.sql`: trigger behavior, check constraints, own-row SELECT, no writes for `anon`/`authenticated`.
- `scripts/smoke.mjs`: invalid signup rejected, signup → auto sign-in → dashboard shows nick, signout, signin wrong/right password.

### Manual Testing Steps:

1. Local: `npx supabase db reset`, `npm run dev`, sign up at 360 px with and without phone.
2. Try invalid inputs client-side and via curl (server-side).
3. Production after hosted steps: full signup on a phone; next-day session check; sign out.

## Performance Considerations

Middleware adds one primary-key lookup on `profiles` per authenticated request; negligible at the PRD's low QPS.

## Migration Notes

First migration in the repo. Locally `npx supabase db reset` recreates everything (existing local test users are dropped). Hosted: pre-existing `auth.users` rows have no profile; delete them (test accounts only) rather than backfill. Rollback: `drop trigger on_auth_user_created on auth.users; drop function public.handle_new_user(); drop table public.profiles;` and revert the app commit.

## References

- Roadmap: `context/foundation/roadmap.md` — S-01, Open Roadmap Question #13
- PRD: `context/foundation/prd.md` — FR-001, FR-002, Access Control, Guardrails
- Current auth flow: `src/pages/api/auth/signup.ts:5-20`, `src/middleware.ts:4-25`, `src/lib/supabase.ts:5-21`
- Session config: `supabase/config.toml:158-167`, `supabase/config.toml:255-259`
- CI: `.github/workflows/ci.yml:27-56`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Profile schema and RLS

#### Automated

- [x] 1.1 Migration applies on a clean local DB: `npx supabase db reset` — a4b02ec
- [x] 1.2 RLS/trigger tests pass: `npx supabase test db` — a4b02ec
- [x] 1.3 Lint and type checks pass: `npm run lint` and `npx astro check` — a4b02ec

#### Manual

- [x] 1.4 In local Studio, `profiles` shows RLS enabled with only the `profiles_select_own` policy — a4b02ec

### Phase 2: Signup/signin API with zod validation

#### Automated

- [x] 2.1 Lint and type checks pass: `npm run lint` and `npx astro check`
- [x] 2.2 Build succeeds: `npm run build`
- [x] 2.3 Smoke passes against local dev server with local Supabase: `npm run smoke`
- [x] 2.4 No references to the removed page: `grep -r "confirm-email" src scripts` returns nothing

#### Manual

- [x] 2.5 A POST to `/api/auth/signup` with a malformed phone (e.g. `abc`) via curl redirects with a Polish error and creates no user

### Phase 3: Polish auth UI and profile display

#### Automated

- [ ] 3.1 Lint and type checks pass: `npm run lint` and `npx astro check`
- [ ] 3.2 Build succeeds: `npm run build`
- [ ] 3.3 Smoke passes against local dev server, including "dashboard shows profile nick": `npm run smoke`

#### Manual

- [ ] 3.4 At 360 px viewport (devtools), signup, signin and dashboard have no horizontal scroll and all inputs/buttons are at least 44 px tall
- [ ] 3.5 Submitting signup with empty Imię/Nick or phone "12" shows Polish inline errors without a request
- [ ] 3.6 Signup with a valid optional phone, then without a phone, both land on `/dashboard` with "Cześć, <imię>!" and the nick shown on the dashboard
- [ ] 3.7 Signing up with an already-registered e-mail shows "Konto z tym adresem e-mail już istnieje"

### Phase 4: Hosted rollout and docs

#### Automated

- [ ] 4.1 Lint passes: `npm run lint`
- [ ] 4.2 Hosted migration is applied: `npx supabase migration list` shows `20261109120000` in both Local and Remote columns

#### Manual

- [ ] 4.3 Hosted dashboard shows "Confirm email" disabled and minimum password length 6
- [ ] 4.4 Roadmap question #13 (issue #13) is closed with the decision "confirmation disabled"

### Phase 5: Post-deploy verification

#### Automated

- [ ] 5.1 Read-only production smoke passes: `BASE_URL=https://carpooling.pstawik.workers.dev SMOKE_READONLY=1 npm run smoke`

#### Manual

- [ ] 5.2 On a real phone against production: sign up with name, nick and phone, land on the dashboard signed in, and see the greeting and nick there
- [ ] 5.3 Close the browser, reopen the site the next day: still signed in; auth cookie expiry in devtools is months away, not session-only
- [ ] 5.4 "Wyloguj" ends the session and `/dashboard` redirects to sign-in
