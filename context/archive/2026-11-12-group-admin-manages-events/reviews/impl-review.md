<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Group admin manages events

- **Plan**: context/changes/group-admin-manages-events/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-13
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria on HEAD 3c787f3: `npm run lint` PASS, `npx astro check` 0 errors, `npx supabase test db` 5 files / 187 tests PASS. `npm run build` and `npm run smoke` (66 steps) passed on dbae849; the only later commit touched context files. `npx supabase db reset` was not re-run, to keep local manual-test data; it passed in Phase 1 and the migration is unchanged. All manual rows were confirmed by the user.

Benign extras, not findings: the EventItem edit form has visible labels and autoFocus, and the smoke test has an extra step, "group page shows the edited event".

## Findings

### F1 — Out-of-range years crash the event endpoints with a 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/time.ts:42-68 (reached from src/lib/validation/events.ts:25)
- **Detail**: `warsawLocalToUtc` throws `RangeError: Invalid time value` instead of returning `null` for dates that pass the regex. The reviewer reproduced it in Node with `9999-12-31 23:00` (the day after is in year 10000), `0999-06-01` and `0000-01-01`: Intl formats the year without four digits, so `Date.parse` returns NaN, and `new Date(NaN)` then throws in `formatToParts`. The throw happens inside a zod `.transform`, which `safeParse` does not catch. Any signed-in user can therefore get a 500 from POST `/api/groups/events` or `/update` with a hand-crafted date. The edit form has no `min`/`max`.
- **Fix**: In `warsawLocalToUtc`, return `null` when `wallAsUtc` or any offset or candidate is not finite. Also limit `dateField` to four-digit years 1000–9998, so a malformed year can never reach Intl.
- **Decision**: FIXED — non-finite offsets are filtered in `warsawLocalToUtc`; the regex in `time.ts` and `dateField` requires years 1000–9999. Verified in Node: 9999-12-31 → valid instant, 0999/0000 → null, DST cases unchanged.

### F2 — A start error is reported as a note error when the note is also invalid

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/validation/events.ts:33-48
- **Detail**: The plan says a start error wins when the note also fails. But the future/DST-gap check runs in the object `.transform`, which zod skips once an inner field (here the note, over 200 characters) has failed. So a past date plus a 201-character note redirects with `invalid_event_note`. Only a hand-crafted POST can do this, because the form has `maxlength=200`. Regex failures on date or time still win correctly.
- **Fix**: Move the date/time → `starts_at` check into a `superRefine` that runs even when the note fails (or validate the start separately), so `eventFieldError` sees both issues.
- **Decision**: FIXED — `superRefine(checkStart, { when })` on both schemas runs whenever date and time are well-formed. Verified in Node: past/gap + 201-character note → `invalid_event_start`; future + long note → `invalid_event_note`; happy path unchanged.

### F3 — An admin racing the start boundary gets a 404 page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/groups/events.ts:41, src/pages/api/groups/events/update.ts:40
- **Detail**: zod checks the start against the Worker's clock, and RLS checks it against the database's `now()` a moment later. A start a few seconds ahead can pass zod and then get 42501, which maps to `forbidden` and a 404. The data stays safe, and the plan accepted this (the comment on line 40). Clock skew between the Worker and the database widens the window.
- **Fix**: Accept as is, or reject starts less than about 1 minute ahead in zod, so the boundary race practically never reaches RLS.
- **Decision**: FIXED — `futureStart` in `src/lib/validation/events.ts` requires the start to be more than `START_MARGIN_MS` (60 s) ahead; a start inside the margin gets `invalid_event_start`.

### F4 — Deleting a group would drop its finished events

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261112150000_create_events.sql:20
- **Detail**: `group_id … on delete cascade` removes started events together with their group, while the header says started events are kept for statistics. Nothing deletes groups today, so this is only a trap for a future "delete group" change.
- **Fix**: Note it in the S-09 statistics or a future group-deletion change; leave the applied migration untouched.
- **Decision**: FIXED — recorded in `change.md` Notes; migration unchanged.

### F5 — The delete confirmation promises a declarations cascade that S-07/S-08 must provide

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/groups/EventItem.tsx:29
- **Detail**: The dialog says "Deklaracje tego terminu też zostaną usunięte". If the future declaration tables reference `events(id)` without `on delete cascade`, the dialog text becomes false and every delete fails with 23503, which maps to `unknown`. The plan already intends the cascade ("What We're NOT Doing"), so this is a reminder for those changes.
- **Fix**: Carry it as an explicit requirement into the S-07/S-08 plans (a pgTAP assertion that deleting an event removes its declarations).
- **Decision**: FIXED — requirement recorded in `change.md` Notes for the S-07/S-08 planning.
