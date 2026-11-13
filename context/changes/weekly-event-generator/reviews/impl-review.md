<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Weekly event generator

- **Plan**: context/changes/weekly-event-generator/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-13
- **Verdict**: REJECTED
- **Findings**: 1 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria were re-run on 2026-11-13. `npx supabase test db` passed 193/193, and lint, `astro check`, build and `npm run smoke` all passed. Manual items 1.4, 2.4 and 3.5–3.8 were confirmed by the user in session.

Scope note: the benign additions were three smoke steps (generator visibility for member and admin, and rendering of "Dodano 3 terminy"), a hint paragraph under the form, and the label "Do dnia (włącznie)". They extend coverage and clarity without crossing the "What We're NOT Doing" boundaries.

## Findings

### F1 — 366-day cap bypassed by a malformed date (CPU exhaustion)

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/validation/events.ts:133-140, src/lib/weekly-events.ts:27-35
- **Detail**: The object-level `superRefine` runs in zod 4 even when a field has already failed its regex, so the comment above `generateEventsSchema` is wrong. Verified in session: with `date_to = "99999-0x1-01"`, `Date.parse` gives NaN. Then `spanDays` is NaN, so both the `< 0` and `> 366` checks are false and the code reaches `weeklyDates`. That function's `split("-").map(Number)` reads `"0x1"` as 1, so the loop runs to year 99999: 5.1 M strings in ~3.2 s. This happens before any authorization check, so any signed-in user can burn Worker CPU on each request.
- **Fix**: Make `generateEventsSchema`'s `superRefine` run only when all fields are well-formed, using the zod `when` option the file already uses for `startCheckOptions`. Also make `weeklyDates` defensive: return `[]` unless both parsed values are finite and the span is between 0 and `MAX_SERIES_DAYS` days. Correct the comment.
  - Strength: The `when` pattern already exists in the same file, and a bounded `weeklyDates` makes the helper safe for any caller.
  - Tradeoff: A few lines in two files.
  - Confidence: HIGH — the bypass and the cost were reproduced with the repo's zod.
  - Blind spot: None significant.
- **Decision**: FIXED. `generateEventsSchema`'s superRefine is gated by `seriesCheckOptions` (`when`), `weeklyDates` returns `[]` for an unparsable, reversed or > 366-day range, and the comment is corrected. Verified: the attack input yields 0 dates in 0 ms.

### F2 — No 404 when every date is already past (RLS never consulted)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/events.ts:95, src/pages/api/groups/events/generate.ts:47-52
- **Detail**: When the filter leaves no future start, `generateEvents` returns `created: 0` without touching the DB. In that case a member, a non-member, or any valid uuid gets a 302 with `?message=events_generated&created=0` instead of the 404 that the sibling endpoints and the smoke contract use. Nothing is written or leaked, because every uuid gets the same answer. Still, this is the only authorization path in the events API that never reaches the database. The plan required this early return, so the issue is partly a plan flaw.
- **Fix A ⭐ Recommended**: Reject a series with no future start in validation as `invalid_event_series`. This check runs after the zod parse, in the endpoint or service, with the same `START_MARGIN_MS`.
  - Strength: The DB is always asked when there is something to insert, and a range with no future date is honestly a user mistake ("nothing to generate"). It reuses the existing error code and message.
  - Tradeoff: The "Nie dodano żadnego terminu, pominięto N" case remains only for re-runs where every date is a duplicate. A fully past range now shows an error instead of a count. A non-admin still gets the redirect for an all-past range, because validation runs before RLS, but it is now the same field error any user gets for any group, as with single events.
  - Confidence: MED — it closes the inconsistency for real inputs, but the non-admin all-past case still never reaches RLS (same as single-event validation).
  - Blind spot: The error message text says "zakres … w którym ten dzień wypada", which doesn't name "already past" explicitly.
- **Fix B**: When no rows survive, still make a zero-effect authorization round trip, e.g. call `is_group_admin` via RPC, or run a select restricted to admins, and return `forbidden` for non-admins.
  - Strength: Exact 404 parity with the sibling endpoints in every case.
  - Tradeoff: An extra DB call on a rare path. `is_group_admin` may not be exposed through PostgREST, which needs checking and possibly a grant (a migration).
  - Confidence: LOW — the exposure and grant of the helper are not verified.
  - Blind spot: Whether `public.is_group_admin` is callable by `authenticated` via `/rpc`.
- **Decision**: FIXED (Fix A). `generateEvents` returns the failure `no_future_start` when no start survives the filter, and the endpoint redirects that to `?error=invalid_event_series#terminy`. A re-run where every date already exists still reaches RLS and keeps "Nie dodano żadnego terminu, pominięto N". New smoke step: "a series with no future date is rejected".

### F3 — No pgTAP case for a non-admin batch that collides with an existing start

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/events_rls.test.sql (new ON CONFLICT section)
- **Detail**: The B and C batches only use starts that don't collide with an existing event. Postgres checks the insert policy's WITH CHECK before the ON CONFLICT arbiter, so a colliding start from C should still get 42501 and not be silently swallowed by DO NOTHING, which would let C probe whether an event exists. The expected behaviour is right, but no test proves it.
- **Fix**: Add a `throws_ok` in which C inserts the start of `e0000000-…003` (now() + 14 days) into G1 `on conflict do nothing`, expecting 42501. Bump `plan()`.
- **Decision**: FIXED. New `throws_ok` "C's insert colliding with an existing G1 start is refused, not skipped"; `plan(40)` → `plan(41)`; `npx supabase test db` passes 194/194.

### F4 — A DST-gap date is reported as "istniały już albo minęły"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/group-errors.ts:149
- **Detail**: A date dropped because its time falls in the spring-forward gap (a Sunday at 02:xx in late March) is counted as skipped, with the reason "they existed or have passed". Very rare for activity times. The plan brief already lists this as an accepted risk.
- **Fix**: Leave it as is, already accepted in the plan. Or widen the wording to "(istniały już, minęły albo nie istnieją z powodu zmiany czasu)".
- **Decision**: FIXED. The skipped reason in `eventsGeneratedMessage` now reads "(istniały już, minęły albo nie istnieją z powodu zmiany czasu)". This supersedes the plan's example strings; the "Dodano N" part is unchanged.
