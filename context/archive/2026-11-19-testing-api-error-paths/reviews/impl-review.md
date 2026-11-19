<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Ścieżki błędów i walidacja wejścia w API

- **Plan**: context/changes/testing-api-error-paths/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-19
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria re-run during review (2026-11-19): lint PASS, astro check PASS (0 errors), npm test 137/137, supabase test db 14 files / 575 tests, smoke 121/121 (dev server). Build and smoke against `npm run preview` passed in phase 5 (7460524). Manual rows 1.4, 2.6, 4.5, 4.6, 5.5 have evidence: red-run lines in 16c0d18, extra deliberate breaks for join/children in 590f921, §6.4 in test-plan.md.

Plan drift: every Contract bullet of phases 1–4 has a test or smoke step; 12/12 endpoints with `rewrite("/404")` have a 404 step; phase 3 production diff is a pure rename/move; nothing from "What We're NOT Doing" was done. Extras (control cases on the accepted side of each boundary, `postJson` helper) are within the plan's intent.

## Findings

### F1 — Admin endpoints leak their existence on malformed input, and smoke now pins it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/admin/groups.ts:8-19, src/pages/api/admin/groups/admins.ts:8-19; scripts/smoke.mjs:294 ("anonymous create group with a JSON body is rejected")
- **Detail**: Authorization lives only in the RPC, after body parsing. A non-admin or anonymous caller with a valid form gets 404 (the "does not advertise itself" contract, group-errors.ts:85), but with a JSON or invalid body gets 302 `/admin/groups?error=invalid_input|invalid_name|…`. Pre-existing behaviour, chosen in the plan (plan.md Faza 4 #3); the new smoke step locks it in as expected. Blast radius is small: `/admin/groups` itself 404s for non-admins and redirects anonymous users to sign-in.
- **Fix A ⭐ Recommended**: In both admin endpoints, answer `rewrite("/404")` before parsing when `context.locals.user` is null, and keep RPC authz for signed-in non-admins; update the anonymous JSON smoke step to expect 404.
  - Strength: Closes the anonymous leak with one cheap check, same shape as the `if (!context.locals.user)` guard in every `groups/**` endpoint.
  - Tradeoff: A signed-in non-admin with a malformed body still gets the 302 (closing that needs an `is_app_admin` pre-check = extra RPC round trip).
  - Confidence: MED — middleware already sets `locals.user` for `/api/*`; behaviour change is small but touches production code.
  - Blind spot: Not checked whether any client relies on the anonymous `invalid_input` redirect (none in repo UI).
- **Fix B**: Keep behaviour; add a comment on the smoke step and in §6.4 that the 302 on malformed input is an accepted trade-off for admin endpoints.
  - Strength: No production change; makes the decision explicit.
  - Tradeoff: Leak stays; new endpoints may copy the pattern.
  - Confidence: HIGH — documentation only.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — anonymous guard `rewrite("/404")` before parsing in both admin endpoints; anon JSON smoke step now expects 404, new app-admin JSON step keeps `catch` coverage (`invalid_input`); smoke 122/122; break-check (guard removed → step red with 302) restored

### F2 — §3 status edits landed in this change although the plan said to leave §3 alone

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:71-72 (commit 16c0d18)
- **Detail**: Faza 5 says "Statusu §3 nie zmieniać (należy do `/10x-test-plan`)". Commit p1 carried the §3 edits (Phase 3 → complete, Phase 4 → planned) that `/10x-test-plan` and `/10x-plan` made earlier in this session; included with user approval and stated in the commit body. Phase 4 is not marked complete — that stays with `/10x-test-plan`.
- **Fix**: No code change; when re-running `/10x-test-plan`, it reconciles Phase 4 → complete as usual.
- **Decision**: ACCEPTED — orchestrator bookkeeping, approved by the user and stated in the 16c0d18 body

### F3 — 367-day and 2026-02-30 series tests cannot tell which guard caught the input

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/validation/events.test.ts:135-147
- **Detail**: Both assert only `invalid_event_series`, which `eventSeriesFieldError` returns for any non-`group_id` issue. With the `spanDays > MAX_SERIES_DAYS` check removed, the bounded `weeklyDates` returns `[]`, a `weekday` issue fires, and the 367-day test stays green.
- **Fix**: Also assert the reported field set, as the F1 attack test does: `["date_to"]` for 367 days, `["date_from"]` for 2026-02-30.
- **Decision**: FIXED — `reportedFields` helper + field-set assertions in both tests; break-check (366-day cap removed → 367-day test red, previously green) restored

### F4 — `< 100 ms` budget includes zod's first-parse warm-up

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/validation/events.test.ts:114-119
- **Detail**: The timed `safeParse` is the first call of `generateEventsSchema` in the file, so it includes setup/JIT; a loaded CI runner could approach 100 ms (locally ~0 ms; the original bug took seconds).
- **Fix**: Run one untimed warm-up `safeParse` with valid input before the timed call.
- **Decision**: FIXED — untimed warm-up `safeParse` before the timed call; break-check (no `seriesCheckOptions`) still red; npm test 137/137
