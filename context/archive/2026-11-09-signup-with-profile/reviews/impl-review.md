<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Signup with Profile and Long Session

- **Plan**: context/changes/signup-with-profile/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria re-run on 2026-11-10, all passing:
- `npm run lint`
- `npx astro check`: 0 errors
- `npm run build`
- `npx supabase test db`: 15/15
- `grep -r confirm-email src scripts`: no matches
- `npm run smoke`, both local and production read-only
- `npx supabase migration list`: Local equals Remote

`npx supabase db reset` was not re-run because it drops local data. The CI smoke job applies the migration on a clean database instead. All manual rows were confirmed by the user during `/10x-implement`.

## Findings

### F1 — Submit button never enters pending state; double submit possible

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/auth/SubmitButton.tsx:12
- **Detail**: `useFormStatus()` reports `pending` only for forms that use a React action function. SignUpForm.tsx:70 and SignInForm.tsx:45 post to a native string `action`, so `pending` is always false: the button is never disabled and "Tworzenie konta..." never appears. A double tap sends two `signUp` calls. The second fails with `user_already_exists`, and the browser can follow that response, showing "Konto z tym adresem e-mail już istnieje" even though the first signup succeeded.
- **Fix**: Add a `submitting` state to each form. Set it in `handleSubmit` once validation passes, and pass it to `SubmitButton` as a prop instead of `useFormStatus`.
- **Decision**: FIXED. New hook `src/components/hooks/useSubmitting.ts` resets on bfcache `pageshow`. `SubmitButton` takes a `pending` prop. Both forms guard against double submit.

### F2 — Profile query runs on every signed-in request, including API routes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:19-27
- **Detail**: Every signed-in SSR request now makes two network calls in sequence: `auth.getUser()` and then the `profiles` lookup. This includes `/api/auth/*`; signout, for example, loads the profile and never uses it. Only `dashboard.astro` and `Topbar.astro` read the profile. The plan accepted this cost ("negligible at the PRD's low QPS"), but S-02+ pages will multiply the requests.
- **Fix A ⭐ Recommended**: Skip the profile query when `context.url.pathname.startsWith("/api/")`.
  - Strength: Two-line change. API endpoints never render the profile, and pages keep the plan's "available everywhere" contract.
  - Tradeoff: A future API endpoint that needs the profile must query it itself.
  - Confidence: HIGH — no current `/api/` code reads `locals.profile`.
  - Blind spot: None significant.
- **Fix B**: Replace `locals.profile` with a memoized `locals.getProfile()` that queries on first call.
  - Strength: Only pages that actually render the profile pay for the query.
  - Tradeoff: Changes the `App.Locals` contract and its callers (dashboard, Topbar), so it is more churn than this slice needs.
  - Confidence: MED — Astro locals accept functions, but this pattern is new to the codebase.
  - Blind spot: How it interacts with cookie refresh timing.
- **Decision**: FIXED via Fix A. `src/middleware.ts` skips the profiles query for `/api/` paths.

### F3 — Stale smoke comment says production has e-mail confirmation on

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/smoke.mjs:39-40
- **Detail**: Phase 4 disabled confirmation everywhere, but the `SMOKE_READONLY` comment still gives "e-mail confirmation is on" as the reason. Only the pollution reason is still true.
- **Fix**: Change the comment so the only reason given is that throwaway signups pollute production auth.
- **Decision**: FIXED. Comment updated.

### F4 — Profile and auth errors swallowed without a log

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts:26
- **Detail**: `error ? null : ...` throws the error away. A deploy-ordering failure that the plan itself calls out (the `profiles` table missing in production) would look exactly like "no profile" and leave nothing in the Worker logs.
- **Fix**: Add `console.error("profile lookup failed", error.message)` when `error` is set, and keep the null fallback.
- **Decision**: FIXED. `src/middleware.ts` logs the error message and keeps the null fallback.

### F5 — Arbitrary text can be shown via `?error=` / `?message=`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/auth/signin.astro:5-6, src/pages/auth/signup.astro:5
- **Detail**: There is no XSS: Astro and React escape the output, and lint bans `set:html`. But anyone can link to `/auth/signin?error=<any text>` and have that text appear on the login page, which can be used for phishing-style messages.
- **Fix**: Redirect with short codes (`?error=invalid_credentials`) and turn them into Polish text on the page through a whitelist in `auth-errors.ts`.
  - Strength: Removes free text from URLs entirely and centralises the copy.
  - Tradeoff: Touches both endpoints, both pages and the smoke expectations (`error=` prefix checks still pass).
  - Confidence: HIGH — the mapping already exists.
  - Blind spot: zod issue messages would need codes too, or a generic "Nieprawidłowe dane" fallback.
- **Decision**: FIXED.
  - `auth-errors.ts` now holds whitelisted error and notice codes (`authErrorCode`, `signUpIssueCode`, `authErrorMessage`, `noticeMessage`).
  - Both endpoints redirect with codes only. The pages map codes to Polish text.
  - Verified: a crafted `?error=`/`?message=` no longer renders its text, and smoke passes.

### F6 — Non-form POST body gives an unhandled 500

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signup.ts:11, src/pages/api/auth/signin.ts:11
- **Detail**: `request.formData()` throws a TypeError on a JSON or empty body, so the request ends in a 500 instead of a redirect. The endpoints had this pattern before the change.
- **Fix**: Wrap `formData()` in try/catch and redirect with `?error=Nieprawidłowe dane`.
- **Decision**: FIXED. Both endpoints catch `formData()` failures and redirect with `?error=invalid_input`. Verified with a JSON POST: 302, no 500.

### F7 — Signup reveals whether an e-mail is registered (accepted trade-off)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/auth-errors.ts:7-9
- **Detail**: "Konto z tym adresem e-mail już istnieje" lets anyone check whether an e-mail has an account. With confirmation off and auto sign-in required, this is unavoidable, and manual check 3.7 expects this exact message.
- **Fix**: Record it as a known decision in the plan or README, and keep Supabase auth rate limits on in the hosted project.
- **Decision**: FIXED. Recorded as an accepted trade-off in README "Email confirmation is disabled everywhere", with the rate-limit mitigation.

### F8 — Unplanned but benign additions

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:82-83; supabase/migrations/20261109120000_create_profiles.sql:23,55; src/components/Topbar.astro:12
- **Detail**: Changes the plan didn't describe:
  - `globalIgnores([".claude/"])` in ESLint.
  - An extra `truncate` revoke and `revoke execute on handle_new_user()`. Both tighten security.
  - A "Panel" link in the Topbar.

  None of them crosses the "What We're NOT Doing" list.
- **Fix**: Note them in this report (done) or in a short addendum to the plan, so S-02 planning treats them as the baseline.
- **Decision**: FIXED. Added `## Implementation Addenda` to plan.md (above `## Progress`), listing these additions and the review fixes.
