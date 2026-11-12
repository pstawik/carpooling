<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Parent Adds Child

- **Plan**: context/changes/parent-adds-child/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

Evidence:

- **Checks:**
  - lint, `astro check` (0 errors) and build pass;
  - `supabase test db` passes (4 files, 153 tests);
  - `migration list` shows Local and Remote in sync;
  - write-mode smoke passed as the `smoke` check on #27;
  - production read-only smoke passed (4/4).
- **Manual checks:** 1.3, 2.5–2.7 and 3.3 were confirmed by the author.
- **Small differences from the plan, all harmless:**
  - `listGroupChildren` throws, and the page catches it;
  - `parentNick` can be `null`;
  - `ChildWriteResult` carries an optional `error` field for logging.
- **Extras within the plan's intent:**
  - extra pgTAP cases (a blank name gives 23514; a removed member and anon get nothing);
  - a final smoke step;
  - small accessibility touches: `sr-only` label, `autoFocus`, `scroll-mt-4`.

## Findings

### F1 — `unknown` error from a children action shows off-screen

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**:
  - src/pages/api/groups/children.ts:46
  - src/pages/api/groups/children/update.ts:44
  - src/pages/api/groups/children/delete.ts:40
  - src/lib/services/group-errors.ts:41-48
- **Detail**:
  - The endpoints redirect to `?error=unknown#dzieci`.
  - `unknown` is not in `CHILD_FEEDBACK_CODES`, so the page shows it in the top banner while the browser jumps to the Dzieci card.
  - On a 360 px screen the user sees no feedback. The plan wants feedback to be visible after the `#dzieci` jump.
- **Fix**: Drop `#dzieci` from the `unknown` redirect in the three endpoints. The user then lands at the top of the page and sees the banner, the same way `not_configured` already works.
- **Decision**: FIXED (anchor dropped for `unknown` in all three endpoints)

### F2 — An ex-member's children stay visible and nobody can delete them

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261112140000_create_children.sql:16, 65-69
- **Detail**:
  - `children` cascades only when the group or the profile is deleted.
  - After a member is removed (via SQL today, or FR-007 later), their children stay visible to the group without a nick. The parent can no longer delete them, because `children_delete_own` requires membership.
  - The plan accepts this under "What We're NOT Doing", and the README documents the SQL cleanup. It is still a trap for whoever ships member removal.
- **Fix A ⭐ Recommended**: Leave the schema as is. Make sure the FR-007 slice, and S-07, which adds attendance rows, plan the cleanup explicitly.
  - Strength: Matches the scope the plan agreed. No production migration now. The README already gives the SQL.
  - Tradeoff: Relies on a future plan remembering it. A manual SQL removal before then leaves orphans until someone runs the cleanup.
  - Confidence: HIGH — no member-removal path exists in the app today.
  - Blind spot: The roadmap has no FR-007 slice, so there is no obvious place to record it yet.
- **Fix B**: Add an `AFTER DELETE` trigger on `group_members` that deletes the leaver's children in that group, plus a pgTAP case.
  - Strength: Removes the problem at the database level for every removal path, including manual SQL.
  - Tradeoff: A new migration and another hosted `db push`. It also decides for S-07 whether attendance survives a member's removal.
  - Confidence: MED — the trigger is simple, but whether children should outlive membership is a product decision.
  - Blind spot: Not checked whether the PRD wants a removed parent's history kept for the statistics (FR-017).
- **Decision**: FIXED via Fix A (schema unchanged; recorded as an Unknown on roadmap S-07, to decide before FR-007)

### F3 — `invite.ts` reads the body without `clone()` before `rewrite("/404")`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/groups/invite.ts:15
- **Detail**:
  - The new children endpoints read `context.request.clone().formData()`. Their comment says Astro refuses `rewrite("/404")` once the original body has been consumed.
  - `invite.ts` reads the original body and then calls `rewrite("/404")` for a forbidden or malformed request, so it may fail on that path.
  - This bug predates the change. The new code is the correct version.
- **Fix**: Check it with a forbidden invite POST. If it fails, switch `invite.ts` to `clone()` in a separate change.
- **Decision**: FIXED (`invite.ts` now reads `request.clone().formData()`, applied in the close-out PR)

### F4 — `Child` type in `src/types.ts` is unused

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/types.ts:37-43
- **Detail**: The plan required `Child`, but the service declares its own `ChildRow` and `GroupChild`, so nothing imports it.
- **Fix**: Leave it for S-07, which reads child rows for attendance, or build `ChildRow` from it (`Pick<Child, "id" | "name" | "parent_id">`).
- **Decision**: FIXED (`ChildRow` is now built from `Pick<Child, …>`)
