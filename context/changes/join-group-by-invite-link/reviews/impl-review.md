<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Join Group by Invite Link

- **Plan**: context/changes/join-group-by-invite-link/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Notes

- **Plan drift:** every planned change matches its contract. That covers:
  - the migration: table, policy, grants, token encoding and the 4 functions;
  - pgTAP: `plan(44)`, a superset of the planned assertions;
  - the services, endpoints and pages;
  - auth threading of `?invite=`;
  - smoke step order;
  - the README.

  The one minor deviation: `InvitePanel` uses `<textarea readOnly rows={2}>` instead of a read-only `input`. It serves the 360 px wrap goal, so it is not a finding.
- **Safety, checked and clean:**
  - all `security definer` functions set `search_path = ''`, and there is no dynamic SQL;
  - `anon` can execute only `invite_group_name`, which returns only the name;
  - every redirect or href with the token uses a regex-validated value;
  - there is no `set:html`;
  - Astro `checkOrigin` covers the form POSTs;
  - the token is unique-indexed;
  - the join upsert never downgrades a role;
  - tokens are never logged.
- **Success criteria (re-run 2026-11-12):**
  - pgTAP passes: 114 tests in 3 files;
  - lint, `astro check` (0 errors) and build pass;
  - local smoke and read-only production smoke pass;
  - `migration list` shows local and remote in sync;
  - CI was green on #24 and #25.

  `npx supabase db reset` (1.1) was not re-run, so as not to wipe local data. CI applies the migrations to a clean database on every run.
- **Manual items:** 4.6–4.8, 5.3 and 5.4 were confirmed by the user in the implementing session. 1.3, 2.5–2.6 and 3.5–3.7 were confirmed in earlier sessions; their commits carry the matching code.

## Findings

### F1 — Public /join page returns 500 when the name lookup RPC fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/invites.ts:18-20, src/pages/join/[token].astro:14
- **Detail**:
  - `getInviteGroupName` throws on any RPC error, and the public `/join/<token>` page calls it with no try/catch. A Supabase or PostgREST hiccup therefore gives an anonymous visitor an unhandled 500 instead of a card.
  - The sibling `joinByInvite` logs the failure and returns `{ kind: "error" }`; `admin/groups.astro` logs and shows an `unknown` message.
  - The group page (`groups/[id].astro:29`, `getGroupInviteToken`) throws the same way, but that page already does so for `getGroupWithAdmins`, so only the public page is flagged.
- **Fix**: Catch the error in `[token].astro`, `console.error` the code and message only (never the token), and render a generic "Coś poszło nie tak — spróbuj ponownie" card with status 503, keeping 404 only for unknown or malformed tokens.
- **Decision**: FIXED: `[token].astro` catches the lookup error, logs it without the token, and renders a 503 "Coś poszło nie tak" card. Verified by forcing the RPC to fail: 503 with the card; after the restore, 404 again.

### F2 — Join failure after sign-up/sign-in lands silently on /dashboard

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/invites.ts:55-56
- **Detail**:
  - The plan specifies that `joinRedirect` sends an RPC `error` to a bare `/dashboard`. After an invite-driven sign-up or sign-in the user is signed in, but nothing says the join did not happen.
  - The failure is logged.
  - This is a plan-level choice, not drift.
- **Fix**: Redirect `error` to `/join/<token>`, where the signed-in user sees "Dołącz do grupy" and can retry, instead of `/dashboard`.
- **Decision**: FIXED: `joinRedirect` now sends both `invalid` and `error` to `/join/<token>`. This consciously departs from the plan's "Critical Implementation Details" ("any other RPC error → log and redirect to `/dashboard`"). The `join.ts` branch for a missing Supabase client still goes to `/dashboard`. Lint, `astro check`, build and smoke pass.

### F3 — Unplanned deletion of a Studio snippet in the p4 commit

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: supabase/snippets/Untitled query 584.sql (deleted in eb1adc9)
- **Detail**:
  - A leftover local Supabase Studio snippet was removed in the Phase 4 commit. The user chose "Stage all" at the dirty-path prompt.
  - No phase mentions it, and nothing references it.
- **Fix**: None needed; accept as benign cleanup.
- **Decision**: ACCEPTED: benign cleanup of an unreferenced local snippet.
