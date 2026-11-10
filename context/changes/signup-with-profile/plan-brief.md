# Signup with Profile and Long Session — Plan Brief

> Full plan: `context/changes/signup-with-profile/plan.md`

## What & Why

Roadmap slice S-01 (FR-001, FR-002, issue #4): registration collects first name, nick, e-mail, password and an optional phone, and the user stays signed in until they sign out. Every later slice (groups, children, declarations, driver phone in the event plan) references this profile, and its migration sets the RLS pattern for all future tables.

## Starting Point

Supabase e-mail/password auth works via the SSR client and middleware, but signup collects only e-mail + password, has no input validation, and ends on a "check your e-mail" page. There is no database schema yet, and the UI is in English.

## Desired End State

A parent signs up on a phone in Polish, lands on `/dashboard` already signed in ("Cześć, <imię>!" and their nick on the dashboard), and stays signed in across browser restarts until "Wyloguj". The profile lives in `public.profiles`, written only by a signup trigger and readable only by its owner; invalid input is rejected server-side by zod.

## Key Decisions Made

| Decision            | Choice                                                         | Why (1 sentence)                                                                 |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Session length      | Until sign-out (no timebox/inactivity timeout)                 | Matches PRD "do wylogowania"; already the Supabase default, so only verify and document. |
| E-mail confirmation | Disabled everywhere; signup auto-signs-in → `/dashboard`       | PRD sends no e-mails and FR-006 needs signup → auto-join in one flow (resolves #13). |
| Nick                | Free display name, not unique                                  | Only shown within small groups next to the name; avoids signup collisions.        |
| Phone               | Optional, lenient: strip separators, `+?` and 9–15 digits      | Accepts common Polish formats and enables tap-to-call without strict E.164 parsing. |
| UI language         | Polish, hard-coded (no i18n)                                   | Real users are Polish parents; sets the convention for later slices.             |
| Profile visibility  | Own row only (SELECT); writes only via trigger                 | Least privilege; S-02 adds a "shares a group" policy with groups.                 |
| Profile creation    | `signUp` metadata + `after insert on auth.users` trigger       | Atomic, works with or without a session; missing name/nick aborts the signup.    |
| Validation          | zod schemas in `src/lib/validation/auth.ts`, shared by API and form | One rule set client- and server-side, as AGENTS.md requires.                 |

## Scope

**In scope:**
- `profiles` migration with checks, trigger, RLS + pgTAP test run in CI
- zod-validated signup/signin, Polish error mapping, auto sign-in, removal of `/auth/confirm-email`
- Polish signup/signin/dashboard, profile fields, `locals.profile`, greeting + nick on the dashboard, 360 px / 44 px targets
- Smoke test proving signup → dashboard shows nick
- Hosted: confirmation off, `supabase db push`; README and config docs

**Out of scope:**
- Profile editing, password reset, app-admin role, visibility of other users' profiles
- Nick uniqueness, strict phone formats, i18n framework, session timeouts
- Repopulating form fields after server-side errors; translating starter landing pages
- Adding the Topbar / a navigation shell to `/dashboard` (Topbar stays on `/` only)

## Architecture / Approach

Form (React, zod) → `POST /api/auth/signup` (zod) → `supabase.auth.signUp({ options.data })` → trigger `handle_new_user` inserts `public.profiles` → session cookies set → redirect `/dashboard`. Middleware loads `auth.getUser()` (refreshing tokens) plus the own profile row into `locals.profile` for the dashboard and the landing-page Topbar. RLS: `profiles_select_own` only; no write grants for `anon`/`authenticated`.

## Phases at a Glance

| Phase                                  | What it delivers                                                       | Key risk                                                     |
| -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Profile schema and RLS              | First migration, trigger, own-row policy, pgTAP test in CI             | Becomes the RLS template for all later tables — must be right |
| 2. Signup/signin API with zod          | Validated endpoints, metadata, auto sign-in, Polish errors, smoke      | Phone normalization drifting from the DB check               |
| 3. Polish auth UI and profile display  | New fields, Polish screens, greeting + nick on dashboard, smoke asserts nick | Touch-target and 360 px regressions in existing auth styling |
| 4. Hosted rollout and docs             | Confirmation off, migration pushed, README/config updated (pre-merge)  | Merging before hosted steps breaks production signup          |
| 5. Post-deploy verification            | Production smoke, real-phone signup, next-day session, sign-out        | Needs the merge + deploy; failures go to a follow-up branch   |

**Prerequisites:** local Supabase (`npx supabase start`), `.dev.vars`, access to the hosted Supabase dashboard and `supabase link` credentials.
**Estimated effort:** ~2 sessions across 5 phases (Phase 5 is a short check the day after deploy).

## Open Risks & Assumptions

- Hosted steps (Phase 4) must happen before the PR merges, since Workers Builds deploys `main` immediately.
- Pre-existing hosted users have no profile row; assumed to be test accounts and deleted, not backfilled.
- Assumes `@supabase/ssr` default cookie `maxAge` (long-lived) is unchanged in the installed version; Phase 4 verifies it in devtools.

## Success Criteria (Summary)

- A new parent registers on a phone in Polish and is signed in immediately, with their nick visible.
- They remain signed in across days until they choose "Wyloguj".
- No API path lets a user read another user's profile or write any profile row directly.
