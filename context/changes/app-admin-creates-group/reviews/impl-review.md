<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: App Admin Creates Group

- **Plan**: context/changes/app-admin-creates-group/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated checks run during review: `npm run lint` PASS, `npx astro check` PASS (0 errors), `npx supabase test db` FAIL locally 3/55 (tests 35, 40, 43; see F2). CI is green on PR #20 because it uses a fresh database. Build and smoke passed earlier the same day. All manual Progress rows were confirmed by the user during implementation.

## Findings

### F1 — Studio scratch query committed to the repo

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/snippets/Untitled query 584.sql
- **Detail**: Committed in 77b7b0f. It inserts passwordless `auth.users` rows, makes `admin1@example.com` an app admin and calls `create_group`, ending in `commit;`. If anyone runs it in the hosted SQL editor, it adds a fake app admin to production and breaks the 4.3 invariant (the owner is the only app admin). Nothing in `.gitignore` covers `supabase/snippets/`.
- **Fix**: `git rm` the file and add `snippets/` to `supabase/.gitignore`.
- **Decision**: SKIPPED

### F2 — pgTAP group counts assume an empty database

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/groups_rls.test.sql:289, :306 (and the "X sees all groups" results_eq, test 35)
- **Detail**: Three tests compare against every row in `public.groups`. `supabase test db` fails 3/55 on a local database that still holds groups from smoke runs (verified: have 8, want 3). CI passes only because its database is fresh. Later slices (S-03 and on) will hit this every time a developer runs smoke before the tests.
- **Fix**: Scope the assertions to the fixture: count the groups created by X or with the fixture ids, or record the count before `create_group` and assert the change.
- **Decision**: FIXED — a `preexisting_groups` temp-table snapshot is taken before the X section; the count and name lookups are scoped to rows not in it. `supabase test db` passes 70/70 on a used local DB.

### F3 — Seed app admin with a known password could reach hosted preview branches

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/seed.sql:1-79, supabase/config.toml:60-65
- **Detail**: `[db.seed] enabled = true` runs `seed.sql`, which creates `admin@example.com` / `Admin-Passw0rd!` as an app admin. The README already warns against `db push --include-seed` and `db reset --linked`. But if Supabase Branching (GitHub integration) is ever turned on, it seeds hosted preview branches automatically, so each would be publicly reachable with a known app-admin login. Nothing exposes this today.
- **Fix**: Add Supabase Branching to the README seed warning: keep it off, or point branches at a separate seed.
  - Strength: Zero code change; the risk only exists if someone turns on a setting, so documenting it at the point of decision is enough.
  - Tradeoff: Relies on someone reading the README before enabling Branching.
  - Confidence: MED — based on Supabase's documented Branching behaviour; the project's Supabase settings were not checked.
  - Blind spot: Whether Branching is already enabled on the hosted project.
- **Decision**: FIXED — README "Local seed app admin" warning now says to keep Supabase Branching off and explains why.

### F4 — Commit subjects use Conventional Commit prefixes, which AGENTS.md forbids

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: commits 62ac45b, 3037a25, 77b7b0f, d5be428, 18b251b
- **Detail**: AGENTS.md says commit subjects are "short, imperative, sentence case with no prefix". The /10x-implement skill prescribes `<type>(<change-id>): … (pN)`. The two instructions conflict and the skill format won. The commits are already merged, so this is about future changes.
- **Fix A ⭐ Recommended**: Record a lesson in which AGENTS.md wins (subject with no prefix; keep `(pN)` in the body or as a suffix).
  - Strength: AGENTS.md is the repo's stated contract and is shared with non-Claude tools.
  - Tradeoff: Phase commits lose the machine-greppable `(change-id)` scope.
  - Confidence: HIGH — the rule is explicit in AGENTS.md.
  - Blind spot: Whether any tooling, such as /10x-archive, parses the prefix.
- **Fix B**: Amend AGENTS.md to allow the 10x prefix format for change-chain commits.
  - Strength: Keeps the skill's traceability as-is.
  - Tradeoff: Changes a team rule to fit a tool.
  - Confidence: MED — depends on team preference.
  - Blind spot: Other contributors' expectations.
- **Decision**: Fixed via Fix A — ACCEPTED-AS-RULE: Commit subjects follow AGENTS.md, not the skill's Conventional Commits format (context/foundation/lessons.md). Merged commits left as-is.

### F5 — Small migration tuning: `(select is_app_admin())`, `stable` on admin_list_groups

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261110120000_create_groups.sql:120, :126, :237
- **Detail**: The policies call `public.is_app_admin()` directly. Supabase recommends `(select …)` so Postgres evaluates it once per query instead of once per row, and the profiles migration already uses `(select auth.uid())`. `admin_list_groups` only reads but is declared `volatile`. Neither matters at the current scale.
- **Fix**: In a follow-up migration (the applied one must not be edited), recreate the two policies with `(select public.is_app_admin())` and alter `admin_list_groups` to `stable`.
- **Decision**: FIXED — `supabase/migrations/20261112120000_tune_group_policies.sql` (alter policy ×2, alter function stable). Applied locally, pgTAP passes. Must be pushed to hosted (`npx supabase db push --linked`) before the PR carrying it merges.

### F6 — E-mail resolution edge cases in the RPCs

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261110120000_create_groups.sql:176, :192, :220-221
- **Detail**: `lower(u.email)` cannot use the `auth.users` email index (fine at MVP scale). `add_group_admin` uses `limit 1` with no `order by`, so if two auth users share an address (SSO plus e-mail), which one it picks is arbitrary, while `create_group` would add both. The RPC does not cap the array size; only zod limits it to 10, and the caller is already an app admin.
- **Fix**: Accept for MVP; revisit only if SSO providers are added.
- **Decision**: ACCEPTED — e-mail/password auth only (no SSO), so duplicate addresses can't occur; scale is small; only app admins can call the RPCs. Revisit if SSO is added.

### F7 — Admin API endpoints don't log unexpected RPC errors

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/admin/groups.ts:31-35, src/pages/api/admin/groups/admins.ts
- **Detail**: Errors other than P0001 and 42501 become `?error=unknown` with no log, while `admin/groups.astro` and `dashboard.astro` log with `console.error` for Worker logs. `signup.ts` doesn't log either, so the endpoints are consistent with the auth endpoints but not with the pages.
- **Fix**: Add `console.error` (with the eslint-disable comment) when the mapped failure is `unknown`.
- **Decision**: FIXED — both endpoints log `<rpc> failed: <code> <message>` for `unknown` failures.

### F8 — `emailSchema` duplicated between validation modules

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/validation/groups.ts:7-11, src/lib/validation/auth.ts:3-7
- **Detail**: The two definitions are identical copies and will drift apart.
- **Fix**: Export one `emailSchema` (e.g. from `auth.ts` or a new `common.ts`) and import it in both.
- **Decision**: FIXED — `emailSchema` is exported from `validation/auth.ts`; `validation/groups.ts` imports and re-exports it. Lint and astro check pass.

### F9 — Test gaps for grants that a later change could loosen

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/groups_rls.test.sql, scripts/smoke.mjs
- **Detail**: Not covered:
  - anon denied `add_group_admin`, `admin_list_groups` and the helper functions;
  - a non-member app admin cannot read profiles;
  - an app admin cannot write the tables directly;
  - a regular user POSTing to `/api/admin/groups` gets a 404 (smoke only GETs the page).
- **Fix**: Add these assertions and one smoke step in the next change that touches these files (S-03).
- **Decision**: DEFERRED to S-03 — queued in `follow-ups/review-fixes.md`.
