<!-- PLAN-REVIEW-REPORT -->
# Plan Review: App Admin Creates Group

- **Plan**: context/changes/app-admin-creates-group/plan.md
- **Mode**: Deep (claims verified inline; small codebase)
- **Date**: 2026-11-10
- **Verdict**: REVISE → SOUND after fixes
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | WARNING |
| Architectural Fitness | WARNING |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
8/8 paths ✓, symbols ✓ (`src/env.d.ts` Locals, `profiles_rls.test.sql:21` policies_are, `config.toml` [db.seed]), brief↔plan ✓, Progress 26/26 rows ✓

## Findings

### F1 — group_members FK points at auth.users, so profiles can't be embedded

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 migration; Phase 3 getGroupWithAdmins
- **Detail**: PostgREST embeds only along FKs; `group_members.user_id → auth.users` gives no path to `public.profiles`, so reading admin names in one query fails.
- **Fix**: Reference `public.profiles(id) on delete cascade`.
- **Decision**: FIXED

### F2 — Unknown-e-mail error doesn't name the e-mail as agreed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 §2–3; Desired End State
- **Detail**: Decision said the error names the unknown e-mail; plan carried only `?error=unknown_email` (code-only redirects).
- **Fix A ⭐ Recommended**: RPC puts the e-mail in `detail`; redirect adds `&email=`, shown escaped only if it parses as an e-mail.
- **Fix B**: Generic message instead.
- **Decision**: FIXED (Fix A)

### F3 — Seed admin with a known password could reach production

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §6; Phase 4
- **Detail**: `db push --include-seed` / `db reset --linked` would create a hosted app admin with a documented password.
- **Fix**: README warning + Phase 4 pre-merge check (4.6).
- **Decision**: FIXED

### F4 — App admin opening /groups/[id] for a non-member group undecided

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1, §3
- **Detail**: RLS lets the app admin read any group and memberships but not profiles, so the page would render nameless admins instead of 404.
- **Fix**: Members-only group page; manual check 3.9.
- **Decision**: FIXED

### F5 — is_app_admin RPC on every page request

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 §1, §3
- **Detail**: Extra round trip on `/` and auth pages; API routes double-checked what the RPC enforces.
- **Fix**: Lookup only on `/dashboard` and `/admin/*`; API relies on RPC 42501 → 404.
- **Decision**: FIXED

### F6 — No 404 page exists

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §4, Phase 3 §3
- **Detail**: A bare 404 Response is a blank screen on a phone.
- **Fix**: Polish `src/pages/404.astro` (Phase 2 §5); pages use `Astro.rewrite("/404")`.
- **Decision**: FIXED

### F7 — RPC error contract left as "e.g."

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details
- **Detail**: pgTAP `throws_ok` and the API mapping both depend on the exact error shape.
- **Fix**: `errcode 'P0001'`, message `unknown_email` | `group_not_found` | `no_admins`, detail = e-mail; denial `42501`.
- **Decision**: FIXED
