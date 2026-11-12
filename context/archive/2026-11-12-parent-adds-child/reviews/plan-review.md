<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Parent Adds Child

- **Plan**: context/changes/parent-adds-child/plan.md
- **Mode**: Deep
- **Date**: 2026-11-12
- **Verdict**: SOUND (after fixes; was SOUND with minor fixes)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING → PASS after F1 |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → PASS after F2, F3 |
| Plan Completeness | PASS |

## Grounding
7/7 existing paths ✓ (2 new files correctly absent); symbols is_group_member / profiles_select_group_peers / groupRpcFailure / SMOKE_READONLY ✓; brief↔plan ✓; Progress 14/14 rows ↔ Success Criteria ✓

## Findings

### F1 — The #dzieci anchor scrolls past the notice and error banner

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 §5 (Endpoints) and §6 (Group page)
- **Detail**: Redirects end in `#dzieci`, while `[id].astro` renders the `?message=`/`?error=` banners at the top of the page. At 360 px the feedback is off-screen, so criterion 2.5 would fail.
- **Fix**: Render the child_* notices and errors inside the Dzieci card, above the add form. The top-of-page banner skips these codes.
- **Decision**: FIXED

### F2 — Smoke steps don't specify a session and don't test a write to another parent's child

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 §7 (Smoke steps)
- **Detail**: "Run as the joined member" doesn't match `smoke.mjs`, whose write steps end with the admin signed in (smoke.mjs:203-235). No HTTP check proves that a 0-row update or delete maps to `child_not_found`. Short child names risk false `contains` passes.
- **Fix**: Run the children steps as the stranger before smoke.mjs:202, using unique names. After "designated admin signs in again", check that the admin sees the child and that deleting it as the admin gets `child_not_found`.
  - Strength: Covers the most sensitive guarantee end to end, using sessions that already exist.
  - Tradeoff: About 3 extra steps and an ordering dependency between sessions.
  - Confidence: HIGH — the session order was read from smoke.mjs:150-235.
  - Blind spot: How the child_id is parsed from the HTML depends on the final island markup.
- **Decision**: FIXED

### F3 — A removed member's children are left orphaned

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: What We're NOT Doing / Phase 1 policies
- **Detail**: The update and delete policies require membership. After FR-007 or a manual SQL removal, the member's children stay visible in the group and nobody can delete them through the app.
- **Fix**: Note in "What We're NOT Doing" that FR-007 or the manual removal must also delete that member's children in the group.
- **Decision**: FIXED
