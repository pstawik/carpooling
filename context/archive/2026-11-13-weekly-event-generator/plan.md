# Weekly event generator Implementation Plan

## Overview

Roadmap S-06 (FR-013): a group admin generates weekly events (terminy) on a chosen weekday, within a date range, at a given Warsaw time, without creating duplicates. Each generated event is an ordinary row in `public.events`, so it can be edited and deleted on its own like any S-05 event.

## Current State Analysis

S-05 delivered everything the generator writes into:

- `public.events` with `starts_at timestamptz`, optional `note`, `created_by default auth.uid()` and a unique index on `(group_id, starts_at)`, which is exactly the PRD duplicate rule "same group, same date and time" (`supabase/migrations/20261112150000_create_events.sql:18-33`).
- Per-operation RLS: insert only by a group admin, only for `starts_at > now()`, only with `created_by = auth.uid()` (`…create_events.sql:56-64`).
- Warsaw ↔ UTC conversion that looks up the offset for each instant and rejects DST-gap times (`src/lib/time.ts:52`).
- The zod form pattern with `eventFieldError` and a 60 s start margin (`src/lib/validation/events.ts:28`, `:96`).
- The events service and its PostgREST error mapping (`src/lib/services/events.ts:25`).
- The form-POST endpoint pattern: 404 for a forbidden or tampered request, and a redirect with a code to `#terminy` otherwise (`src/pages/api/groups/events.ts`).
- Feedback codes routed to the Terminy card (`src/lib/services/group-errors.ts:50`).
- The Terminy card with the admin-only "Dodaj termin" form (`src/pages/groups/[id].astro:119-239`).
- Smoke steps for events (`scripts/smoke.mjs:104-370`).

Missing: anything that creates more than one event per request.

## Desired End State

In the Terminy card, a group admin opens a collapsed "Generuj terminy cotygodniowe" section. They pick a weekday, a time, and a start and end date. The end date is included and may be at most 366 days after the start. Submitting creates one event for each matching date whose start is still in the future.

Dates that already have an event at that moment are skipped. So are dates whose start has passed and dates that do not exist in Warsaw time (DST gap). The admin sees, for example, "Dodano 12 terminów, pominięto 2 (istniały już albo minęły)".

Generated events start with no note. They appear in the normal list with the normal Edytuj/Usuń controls. A non-admin cannot generate (404), and the database alone enforces that.

Verify with `npx supabase test db` (new ON CONFLICT cases), `npm run lint`, `npx astro check`, `npm run build` and `npm run smoke` (new generator steps).

### Key Discoveries:

- One statement creates the whole series: supabase-js `upsert(rows, { onConflict: "group_id,starts_at", ignoreDuplicates: true }).select("id")` becomes `INSERT … ON CONFLICT (group_id, starts_at) DO NOTHING RETURNING id`. The returned rows are exactly the created ones, and the existing insert policy is the only RLS check. It needs no new migration.
- RLS evaluates `starts_at > now()` on every proposed row. A single past row makes the whole statement fail with 42501, which the endpoints turn into a 404. Past dates must therefore be filtered out before the insert, using the same 60 s margin as `START_MARGIN_MS` (`src/lib/validation/events.ts:28`).
- `warsawLocalToUtc` returns `null` for a time in the spring-forward gap (`src/lib/time.ts:50`). Each date is converted separately, so a 17:00 series stays at 17:00 local time across CET/CEST changes.
- Redirects carry codes only (`src/lib/services/group-errors.ts:5`). The `created`/`skipped` counts are the second deliberate exception, after `unknown_email`. They are digits only and validated on read.

## What We're NOT Doing

- No note field on the generator; generated events get `note = null` (notes are for one-off changes, per the S-05 decision).
- No preview/confirmation step, separate page, or series entity. Generated events are independent (PRD Non-Goals: no series edits or exceptions).
- No bulk edit or bulk delete of a series.
- No multiple weekdays per run; the admin runs the generator once per weekday.
- No migration, new RLS policy or RPC.
- No ranges longer than 366 days.

## Implementation Approach

The server works in three steps:

1. **Calendar step.** A pure helper turns `(from, to, weekday)` into calendar dates. It has no time-zone logic.
2. **Instant step.** The service converts each date with `time` to a UTC instant and keeps only those more than 60 s in the future.
3. **Write step.** It inserts the survivors in one `ON CONFLICT DO NOTHING` statement.

`created` = rows returned; `skipped` = all matching dates − `created`. The statement is all-or-nothing: an RLS refusal (non-admin) writes nothing. The UI is a plain form POST like every other events action.

## Critical Implementation Details

- **Ordering of the future filter:** filter before the insert, never after. One past instant in the payload makes RLS reject the whole batch with 42501 (→ 404). If filtering leaves nothing, skip the DB call and return `created: 0`.
- **Weekday math is calendar-only:** compute the weekday of a `YYYY-MM-DD` string with `Date.UTC(...)`/`getUTCDay()`. Using local `Date` or Warsaw instants here would shift dates near midnight.

## Phase 1: Date generation and DB proof

### Overview

Pure date generation, the `generateEvents` service and pgTAP evidence that a batch `ON CONFLICT DO NOTHING` insert behaves correctly under the existing events RLS.

### Changes Required:

#### 1. Weekly date helper

**File**: `src/lib/weekly-events.ts` (new)

**Intent**: List every calendar date in an inclusive range that falls on a given ISO weekday, and export the range cap shared by validation and the form.

**Contract**: `weeklyDates(from: string, to: string, weekday: number): string[]`. Inputs are `YYYY-MM-DD` strings with `from ≤ to`; the weekday is ISO (1 = Monday … 7 = Sunday). The result is ascending, with both ends included and no time-zone logic. `MAX_SERIES_DAYS = 366`: `to` may be at most 366 days after `from`.

#### 2. Shared start margin

**File**: `src/lib/validation/events.ts`

**Intent**: Export the existing `START_MARGIN_MS` so the generator filters occurrences with the same boundary as single-event validation.

**Contract**: `export const START_MARGIN_MS` (value unchanged, 60 000).

#### 3. Generate service

**File**: `src/lib/services/events.ts`

**Intent**: Convert dates to Warsaw instants, drop those that are not in the future or do not exist, insert the rest in one statement that skips duplicates, and report the counts.

**Contract**: `generateEvents(supabase, { groupId, dates, time, now }: { groupId: string; dates: string[]; time: string; now: Date })` returns `{ ok: true; created: number; skipped: number } | { ok: false; failure: EventWriteFailure; error?: PostgrestError }`. The payload rows carry `group_id` and `starts_at` only, so `created_by` and `note` take their defaults. There is no DB call when no instant survives the filter. Errors go through the existing `writeResult` mapping (42501 → `forbidden`). `skipped = dates.length − created`.

#### 4. pgTAP cases for batch insert with ON CONFLICT

**File**: `supabase/tests/events_rls.test.sql`

**Intent**: Prove the exact statement the service issues behaves correctly under RLS.

**Contract**: New cases (bump `plan(N)` accordingly), using the existing fixtures:

- As admin A, a two-row `insert … on conflict (group_id, starts_at) do nothing returning id` on G1. One row is new and one collides with the existing future event. It returns exactly 1 row, and the existing row is unchanged.
- As member B, the same kind of statement on G1 throws 42501.
- As C (admin of G2), it throws 42501 on G1.
- As A, a batch that mixes a future row and a past row throws 42501. This shows why the service must filter first.
- As A, a row in G1 at the same moment as a G2 event inserts fine (the duplicate rule is per group).

### Success Criteria:

#### Automated Verification:

- pgTAP suite passes including the new ON CONFLICT cases: `npx supabase test db`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`

#### Manual Verification:

- Reviewer confirms by reading `weeklyDates` that the Mon–Sun mapping is ISO (1 = Monday) and that both range ends are included

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Endpoint and messages

### Overview

Validate the generator form, expose `POST /api/groups/events/generate`, and add the Polish feedback with counts.

### Changes Required:

#### 1. Generator schema

**File**: `src/lib/validation/events.ts`

**Intent**: Parse and validate the generator form; any problem with a user-editable field becomes one user-facing error code.

**Contract**: `generateEventsSchema` takes these form fields:

- `group_id`: uuid.
- `weekday`: `"1"`–`"7"`, parsed to a number.
- `date_from` and `date_to`: the existing `dateField`, and each must also be a real calendar date (round-trip check like `warsawLocalToUtc`).
- `time`: the existing `timeField`.

It also checks that `date_to ≥ date_from`, that `date_to` is at most `MAX_SERIES_DAYS` after `date_from`, and that `weeklyDates(...)` is non-empty. It transforms to `{ groupId, dates, time }`.

`eventSeriesFieldError(raw, issues)` returns `{ groupId, code: "invalid_event_series" }` when every issue is on a field other than `group_id` and `group_id` is a valid uuid; otherwise it returns `null`, which means 404. Past `date_from` values are allowed: their dates become "skipped".

#### 2. Generate endpoint

**File**: `src/pages/api/groups/events/generate.ts` (new)

**Intent**: Form POST that mirrors `src/pages/api/groups/events.ts`: no user → redirect to sign-in; a non-form body, a malformed id or `forbidden` → `rewrite("/404")`; `unknown` → log and show the top banner.

**Contract**: On success, redirect to `/groups/<id>?message=events_generated&created=<n>&skipped=<m>#terminy`. On field errors, redirect to `/groups/<id>?error=invalid_event_series#terminy`. Pass one `now = new Date()` to `generateEvents`.

#### 3. Codes and messages

**File**: `src/lib/services/group-errors.ts`

**Intent**: Add the new error and notice codes, route both to the Terminy card, and build the count message with Polish plurals.

**Contract**:

- `ERROR_MESSAGES.invalid_event_series`: "Wybierz dzień tygodnia, godzinę i zakres dat (najwyżej rok), w którym ten dzień wypada".
- `NOTICE_MESSAGES.events_generated`: "Terminy wygenerowane". This is the fallback when the counts are missing or malformed.
- Both codes go in `FEEDBACK_SECTIONS` → `"terminy"`.
- `eventsGeneratedMessage(created: string | null, skipped: string | null): string`. Each count is accepted only if it matches `/^\d{1,3}$/`, otherwise the fallback is used. The noun is "termin" for 1, "terminy" when the number ends in 2–4 (but not 12–14), and "terminów" otherwise. Examples:
  - `created=3, skipped=0` → "Dodano 3 terminy"
  - `created=12, skipped=2` → "Dodano 12 terminów, pominięto 2 (istniały już albo minęły)"
  - `created=1, skipped=0` → "Dodano 1 termin"
  - `created=0, skipped=3` → "Nie dodano żadnego terminu, pominięto 3 (istniały już albo minęły)"

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- With curl or the browser devtools, a POST from a non-admin member to `/api/groups/events/generate` returns 404 and creates no events

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Generator form and smoke

### Overview

The admin-only collapsed form in the Terminy card, the count message rendering, and smoke coverage.

### Changes Required:

#### 1. Generator form

**File**: `src/pages/groups/[id].astro`

**Intent**: Below the "Dodaj termin" form, add an admin-only `<details>` whose `<summary>` reads "Generuj terminy cotygodniowe" (min-h-11). It holds a POST form to `/api/groups/events/generate`. It opens automatically when the current error is `invalid_event_series`, so the admin sees the form after a mistake.

**Contract**: Labelled fields:

- `weekday`: a `<select>` with Poniedziałek … Niedziela as values 1–7.
- `time`: `<input type="time">`.
- `date_from` and `date_to`: `<input type="date">`, both with `min` set to today in Warsaw.
- A hidden `group_id`.
- A submit button "Generuj terminy" with the existing `submitClass`.

Layout: the `grid-cols-2` pattern of the existing form, which must fit 360 px with no horizontal scroll and 44 px targets. When `messageCode === "events_generated"`, `eventMessage` uses `eventsGeneratedMessage(searchParams created, skipped)`.

#### 2. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Prove the generator end to end against a running server.

**Contract**: New steps after the single-event steps. The series runs from `warsawDateInDays(60)` to `warsawDateInDays(80)` on the weekday of the start date at "18:15", which gives 3 dates:

- A member's POST → 404.
- An admin's generate → 302 to `…?message=events_generated&created=3&skipped=0`.
- The same generate again → `created=0&skipped=3`.
- A range longer than 366 days → `?error=invalid_event_series`.
- `date_from = date_to` on a weekday different from the selected one → `?error=invalid_event_series`.
- A malformed `group_id` → 404.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes including the generator steps: `npm run smoke`

#### Manual Verification:

- At a 360 px viewport, the generator section opens, all fields and the button are usable without zooming, there is no horizontal scroll, and targets are at least 44 px
- A series spanning the last Sunday of March or October keeps the same Warsaw time on every generated event
- A generated event can be edited and deleted on its own with the existing Edytuj/Usuń controls
- A member (non-admin) sees no generator section

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No unit-test framework exists (AGENTS.md). `weeklyDates` and `eventsGeneratedMessage` are checked through the smoke steps and the manual review.

### Integration Tests:

- pgTAP: batch ON CONFLICT DO NOTHING under RLS. The admin succeeds and gets only the new rows; a member and a foreign admin get 42501; a batch with a past row gets 42501; collisions are per group.
- Smoke: the admin generates, a re-run skips everything, the range cap and an empty weekday give `invalid_event_series`, a member and a malformed id get 404.

### Manual Testing Steps:

1. As the group admin on a phone-width viewport, generate Tuesdays 17:00 for the next 3 months and check the count message and the list.
2. Generate the same series again and confirm "Nie dodano żadnego terminu, pominięto N".
3. On a day the weekday matches, generate from today with a time already passed and confirm today's date is counted as skipped.
4. Generate across a DST change and confirm the local times stay the same.

## Performance Considerations

There are at most 53 rows per request, in one statement. Nothing else to note.

## Migration Notes

None. No schema change.

## References

- Roadmap item: `context/foundation/roadmap.md` (S-06)
- PRD: `context/foundation/prd.md` (FR-013, Business Logic → Generator terminów)
- Prior slice: `context/archive/2026-11-12-group-admin-manages-events/plan-brief.md`
- Similar implementation: `src/pages/api/groups/events.ts:9`, `src/lib/services/events.ts:65`, `src/lib/validation/events.ts:63`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Date generation and DB proof

#### Automated

- [x] 1.1 pgTAP suite passes including the new ON CONFLICT cases: `npx supabase test db` — 6d9fd24
- [x] 1.2 Lint passes: `npm run lint` — 6d9fd24
- [x] 1.3 Type check passes: `npx astro check` — 6d9fd24

#### Manual

- [x] 1.4 Reviewer confirms by reading `weeklyDates` that the Mon–Sun mapping is ISO (1 = Monday) and that both range ends are included — 6d9fd24

### Phase 2: Endpoint and messages

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 5f26f7b
- [x] 2.2 Type check passes: `npx astro check` — 5f26f7b
- [x] 2.3 Build passes: `npm run build` — 5f26f7b

#### Manual

- [x] 2.4 With curl or the browser devtools, a POST from a non-admin member to `/api/groups/events/generate` returns 404 and creates no events — 5f26f7b

### Phase 3: Generator form and smoke

#### Automated

- [x] 3.1 Lint passes: `npm run lint` — 0fcdbe9
- [x] 3.2 Type check passes: `npx astro check` — 0fcdbe9
- [x] 3.3 Build passes: `npm run build` — 0fcdbe9
- [x] 3.4 Smoke passes including the generator steps: `npm run smoke` — 0fcdbe9

#### Manual

- [x] 3.5 At a 360 px viewport, the generator section opens, all fields and the button are usable without zooming, there is no horizontal scroll, and targets are at least 44 px — 0fcdbe9
- [x] 3.6 A series spanning the last Sunday of March or October keeps the same Warsaw time on every generated event — 0fcdbe9
- [x] 3.7 A generated event can be edited and deleted on its own with the existing Edytuj/Usuń controls — 0fcdbe9
- [x] 3.8 A member (non-admin) sees no generator section — 0fcdbe9
