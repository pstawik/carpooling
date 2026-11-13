<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Group admin manages events

- **Plan**: context/changes/group-admin-manages-events/plan.md
- **Mode**: Deep
- **Date**: 2026-11-13
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
9/9 paths ✓ (new files' parents exist; migration timestamp sorts last), 4/4 symbols ✓ (is_group_member, is_group_admin, isChildFeedbackCode, childIdAfterName), brief↔plan ✓, Progress↔Phase ✓

## Findings

### F1 — Deleting a started event rewrites statistics

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — events_delete_group_admin; Phase 3 — "Minione terminy"
- **Detail**: The plan forbade editing after start ("would rewrite stats") but allowed deleting past events. Once S-07/S-08 add their cascades, that delete also removes the event's declarations, so finished rides drop out of FR-017 statistics. This goes against PRD → Zakończenie terminu (stats reflect the state at the time of the class).
- **Fix A ⭐ Recommended**: Delete policy also requires `starts_at > now()`; past list read-only; pgTAP asserts 0 rows on a past delete.
  - Strength: One lock rule for edit, delete and declarations; S-09 can trust finished events.
  - Tradeoff: A mistaken past event (only possible via SQL) needs SQL to remove.
  - Confidence: HIGH — the UI can't create past events anyway.
  - Blind spot: None significant.
- **Fix B**: Keep past deletes; record it as an explicit decision plus a note for S-09.
  - Strength: Admins can clean up history.
  - Tradeoff: Stats can be changed after the fact.
  - Confidence: MED — depends on how FR-012 is read.
  - Blind spot: Real need for cleanup unknown.
- **Decision**: FIXED (Fix A)

### F2 — created_by can be spoofed on insert

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — events_insert_group_admin
- **Detail**: INSERT was granted on every column and the policy didn't check `created_by`, so an admin could set it to any user through PostgREST (children pins `parent_id = auth.uid()`).
- **Fix**: Add `and created_by = (select auth.uid())` to the insert WITH CHECK, plus a pgTAP case (spoofed created_by → 42501).
- **Decision**: FIXED

### F3 — groupIdIfOnlyEventFieldsInvalid has an unclear return type

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 §3 — Validation
- **Detail**: Described as returning `string | null`, but it also had to report which error code to use, and which code wins when both fields fail wasn't decided.
- **Fix**: `eventFieldError(raw, issues): { groupId; code } | null`; when both fail, `invalid_event_start` wins.
- **Decision**: FIXED

### F4 — Smoke member-POST must send a valid future start

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 §3 — Smoke test
- **Detail**: zod runs before RLS, so a member POST with a bad date returns 302, not 404, and never tests the RLS insert check. Where the event steps go among the smoke session switches wasn't stated.
- **Fix**: The member POST uses a valid future date/time, in the stranger's session before "stranger signs out"; admin event steps run after "designated admin signs in again".
- **Decision**: FIXED
