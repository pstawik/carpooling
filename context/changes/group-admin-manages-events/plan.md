# Group admin manages events Implementation Plan

## Overview

S-05 (FR-011, FR-012): a group admin creates, edits and deletes single events (terminy) of their group, and every member sees the group's events as a list that starts from the nearest upcoming one. This slice also fixes how an event's start moment is stored, which the declaration lock (S-07, S-08), the weekly generator (S-06) and the statistics (S-09) all build on.

## Current State Analysis

- Groups, memberships, invites and children exist. There is no events table.
- `public.is_group_member(uuid)` (`supabase/migrations/20261110120000_create_groups.sql:75`) and `public.is_group_admin(uuid)` (`supabase/migrations/20261112130000_create_group_invites.sql:33`) are security-definer helpers ready for RLS policies.
- The children slice is the closest pattern: writes through per-operation RLS policies (not RPCs), a column-level `UPDATE` grant, a service that maps `42501` → `forbidden`, `23505` → duplicate, 0 matched rows → `*_not_found` (`src/lib/services/children.ts:25`), and three form-POST endpoints that redirect back to `/groups/[id]?…#dzieci` (`src/pages/api/groups/children.ts`, `children/update.ts`, `children/delete.ts`).
- `src/pages/groups/[id].astro` is the only group page; it 404s non-members (including a non-member app admin), shows per-card feedback for codes in `CHILD_FEEDBACK_CODES` (`src/lib/services/group-errors.ts:41`), and renders admin-only UI from `group.myRole === "admin"`.
- Timezone is decided: event date and time are Europe/Warsaw (issue #14, closed). `src/pages/admin/groups.astro:39` already formats with `timeZone: "Europe/Warsaw"`. The Worker and Postgres run in UTC.
- Verification: `supabase test db` (pgTAP files in `supabase/tests/`) and `npm run smoke` run in CI (`.github/workflows/ci.yml`). The smoke script already has a group admin (smoke user) and a member (the "stranger" who joins by link) (`scripts/smoke.mjs`).

## Desired End State

- On `/groups/[id]` a "Terminy" card (`#terminy`) lists upcoming events ascending by start, each with its Warsaw date, weekday, time and optional note; past events sit below in a collapsed "Minione terminy" list, newest first. An empty group shows "Brak nadchodzących terminów".
- A group admin sees, in the same card, a create form (date, time, optional note) and per-row "Edytuj" / "Usuń" on upcoming events; past events are read-only for everyone.
- The database alone guarantees: only members read a group's events; only that group's admins insert, update or delete; insert and update need a future start; an event that has started can be neither updated nor deleted (finished events feed the statistics); `created_by` is always the inserting user; no two events of a group share the same start moment.
- Verify by `supabase test db` (new `events_rls.test.sql`), lint, `astro check`, build, and `npm run smoke` with new event steps.

### Key Discoveries:

- RLS `UPDATE … USING` filters rows silently (0 rows), while a failed `WITH CHECK` on INSERT or UPDATE raises `42501` — the existing `writeResult` contract in `src/lib/services/children.ts:20-33` already handles both shapes.
- Column-level `UPDATE` grant must follow a table-wide revoke, otherwise it is a no-op (`supabase/migrations/20261112140000_create_children.sql:38-40`).
- Endpoints read `context.request.clone().formData()` so `rewrite("/404")` still works after a parse (`src/pages/api/groups/children.ts:15-21`).
- Redirects carry only codes, never free text (`src/lib/services/group-errors.ts:5`).
- The smoke user is the group admin and the stranger is a plain member (`scripts/smoke.mjs`), so both sides of the admin check can be exercised without new fixtures.

## What We're NOT Doing

- Weekly event generator (S-06) — only single events here; the unique `(group_id, starts_at)` constraint is the part S-06 reuses.
- End time, location or title fields — an event is a start moment plus an optional note.
- A per-event plan page (`/groups/[id]/terminy/[eventId]`) — comes with S-07.
- Editing or deleting an event after it started, or creating/moving an event into the past (backfill and cleanup need SQL). Finished events stay so S-09 statistics reflect the state at the time of the class (PRD → Zakończenie terminu).
- Cascading behaviour for declarations — no declaration tables exist yet; S-07/S-08 add their FKs with `on delete cascade` (FR-012 accepts that deleting an event drops its declarations).
- App-admin access to events of groups they are not a member of (consistent with the current group page).
- Pagination or a calendar view.

## Implementation Approach

Follow the children pattern end to end: a table with RLS policies per operation in one migration, a thin service that maps PostgREST errors to failure codes, zod-validated form-POST endpoints that redirect with codes, and an Astro card with a small React island for the admin's inline edit. Store the start as `timestamptz` (`starts_at`), converted from the admin's Warsaw local date + time on the server; render back in Warsaw with `Intl.DateTimeFormat`. The "future only" and "not started" rules live in RLS using `now()`; zod mirrors them for friendly messages, the database is the guarantee.

## Critical Implementation Details

- **Timing & lifecycle** — Warsaw local → UTC must not assume a fixed offset (CET/CEST). Convert with `Intl.DateTimeFormat` offset lookup for `Europe/Warsaw` and round-trip check the result: a local time inside the spring-forward gap does not round-trip and is rejected as invalid; an autumn-ambiguous time takes the earlier (CEST) instant. Never send an offset-less timestamp to PostgREST — the session timezone is UTC.
- **State sequencing** — "upcoming" means `starts_at > now()`, the same moment that marks an event finished and locks declarations (PRD Business Logic → Zakończenie terminu). Split the list with the server's current time once per request, not per row.

## Phase 1: Events table and RLS tests

### Overview

Create `public.events` with its RLS policies and privileges, and prove them with pgTAP.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261112150000_create_events.sql`

**Intent**: Add the events table so group admins can manage single events and members can read them, with every rule enforced in the database.

**Contract**:
- `public.events (id uuid pk default gen_random_uuid(), group_id uuid not null references public.groups (id) on delete cascade, starts_at timestamptz not null, note text null check (note is null or char_length(trim(note)) between 1 and 200), created_by uuid null references auth.users (id) on delete set null default auth.uid(), created_at timestamptz not null default now())`. Header comment explains S-05, Europe/Warsaw input, and the lock rules; table comment.
- `create unique index events_group_starts_at_unique on public.events (group_id, starts_at)` — PRD duplicate rule (same group, date and time); also serves list-by-group queries.
- RLS enabled; `revoke all … from anon`; `revoke truncate, update … from authenticated`; `grant update (starts_at, note) … to authenticated`.
- Policies (exactly four):
  - `events_select_group_member` — select, `using (public.is_group_member(group_id))`.
  - `events_insert_group_admin` — insert, `with check (public.is_group_admin(group_id) and starts_at > now() and created_by = (select auth.uid()))` (the column default fills it; a spoofed value fails).
  - `events_update_group_admin` — update, `using (public.is_group_admin(group_id) and starts_at > now())` (row not started yet), `with check (public.is_group_admin(group_id) and starts_at > now())` (new start in the future).
  - `events_delete_group_admin` — delete, `using (public.is_group_admin(group_id) and starts_at > now())` (started events are kept for statistics).

#### 2. RLS tests

**File**: `supabase/tests/events_rls.test.sql`

**Intent**: Lock in the isolation and lifecycle rules, following `supabase/tests/children_rls.test.sql` fixture style.

**Contract**: Fixtures: A (admin of G1), B (member of G1), C (admin of G2), D (in no group); a future and a past event in G1 (past one inserted as owner, bypassing RLS). Assertions cover:
- Schema: table exists, RLS on, `policies_are` the four names, anon has no privileges, authenticated has no TRUNCATE / table-level UPDATE, may UPDATE `starts_at` and `note` only (not `group_id`, `created_by`).
- Read: A and B see G1 events; C and D see none.
- Insert: A inserts a future G1 event; A inserting a past start → `42501`; B inserting into G1 → `42501`; C inserting into G1 → `42501`; A inserting with `created_by` = B → `42501`; duplicate `(group_id, starts_at)` → `23505`; note of 201 chars or blank → check violation.
- Update: A moves the future event to another future time; A moving it into the past → `42501`; A updating the past event → 0 rows; B and C updating G1 events → 0 rows; A updating `group_id` → permission denied.
- Delete: B and C delete → 0 rows; A deleting the past event → 0 rows (row still there); A deletes the future event.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh database: `npx supabase db reset`
- All database tests pass, including the new file: `npx supabase test db`

#### Manual Verification:

- Migration file reviewed: four policies, column grant after the table-wide revoke, no client write path other than the policies

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Server side — types, time helpers, validation, service, endpoints

### Overview

Everything between the form and the database: Warsaw time conversion, zod schemas, the events service and the three POST endpoints.

### Changes Required:

#### 1. Entity type

**File**: `src/types.ts`

**Intent**: Add the row type alongside `Child`.

**Contract**: `export interface GroupEvent { id; group_id; starts_at: string; note: string | null; created_by: string | null; created_at }` with a doc comment naming the RLS rules. (Named `GroupEvent` to avoid clashing with the DOM `Event`.)

#### 2. Warsaw time helpers

**File**: `src/lib/time.ts`

**Intent**: One place for Europe/Warsaw ↔ UTC conversion and display, reused by S-06 and the plan page later.

**Contract**:
- `export const APP_TIME_ZONE = "Europe/Warsaw"`.
- `warsawLocalToUtc(date: "YYYY-MM-DD", time: "HH:MM"): Date | null` — `null` for a local time that does not exist (DST gap) or an impossible date; ambiguous autumn time resolves to the earlier instant.
- `utcToWarsawParts(iso: string): { date: "YYYY-MM-DD"; time: "HH:MM" }` — to prefill the edit form.
- `formatEventStart(iso: string): string` — `pl-PL`, weekday + date + time in Warsaw, e.g. "wtorek, 17 listopada 2026, 17:00".

#### 3. Validation

**File**: `src/lib/validation/events.ts`

**Intent**: zod schemas for the three forms, mirroring DB limits, with the future-start rule as a friendly pre-check.

**Contract**:
- `eventNoteSchema` — trimmed, max 200, empty string → `null`.
- Shared `date` (`/^\d{4}-\d{2}-\d{2}$/`) and `time` (`/^([01]\d|2[0-3]):[0-5]\d$/`) fields; a `superRefine`/`transform` on the object converts with `warsawLocalToUtc` and fails on `null` or a start `<= now` under path `starts_at`.
- `addEventSchema { group_id: uuid, date, time, note }` → output `{ groupId, startsAt: string (ISO with Z), note }`; `updateEventSchema` adds `event_id: uuid`; `deleteEventSchema { group_id, event_id }`.
- `eventFieldError(raw, issues): { groupId: string; code: "invalid_event_note" | "invalid_event_start" } | null` — like `groupIdIfOnlyNameInvalid` (`src/lib/validation/children.ts:29`): issues only on `date`/`time`/`starts_at`/`note` and a valid `raw.group_id` → group id plus code; anything else → `null` (404). Code: any `date`/`time`/`starts_at` issue → `invalid_event_start` (wins when the note also fails); only `note` issues → `invalid_event_note`.

#### 4. Service

**File**: `src/lib/services/events.ts`

**Intent**: Read and write events through the caller's RLS-scoped client, mapping errors to failure codes.

**Contract**:
- `listGroupEvents(supabase, groupId): Promise<GroupEventItem[]>` — `id, starts_at, note` ordered by `starts_at` ascending; throws on error.
- `splitEvents(events, now: Date): { upcoming; past }` — upcoming ascending (`starts_at > now`), past descending.
- `addEvent`, `updateEvent`, `deleteEvent` returning `EventWriteResult = { ok: true } | { ok: false; failure: "forbidden" | "duplicate_event" | "event_not_found" | "unknown"; error? }`; update/delete use `.eq("id").eq("group_id").select("id")` so 0 rows → `event_not_found` (non-admin, foreign group, or already started). Same `writeResult` shape as children.

#### 5. Endpoints

**Files**: `src/pages/api/groups/events.ts` (create), `src/pages/api/groups/events/update.ts`, `src/pages/api/groups/events/delete.ts`

**Intent**: Form-POST handlers following the children endpoints exactly: signed-in check, cloned form parse, zod, `createClient`, service call, redirect with a code.

**Contract**:
- Success redirects: `/groups/<id>?message=event_added|event_updated|event_deleted#terminy`.
- Field errors: `?error=invalid_event_start|invalid_event_note#terminy`; malformed ids or non-form bodies → `rewrite("/404")`.
- `forbidden` (non-admin insert, or an admin racing the start boundary) → `rewrite("/404")`; `duplicate_event` / `event_not_found` → `?error=<code>#terminy`; `unknown` → `console.error` + `?error=unknown` without anchor.

#### 6. Messages

**File**: `src/lib/services/group-errors.ts`

**Intent**: Polish texts for the new codes and per-card routing that covers both cards.

**Contract**:
- Errors: `invalid_event_start: "Podaj prawidłową datę i godzinę w przyszłości"`, `invalid_event_note: "Notatka może mieć najwyżej 200 znaków"`, `duplicate_event: "Termin o tej dacie i godzinie już istnieje"`, `event_not_found: "Nie znaleziono terminu albo termin już się rozpoczął"`.
- Notices: `event_added: "Termin dodany"`, `event_updated: "Termin zmieniony"`, `event_deleted: "Termin usunięty"`.
- Replace `isChildFeedbackCode` with `feedbackSection(code): "dzieci" | "terminy" | null` (child codes → `dzieci`, event codes → `terminy`); update the one caller in Phase 3.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- Admin POST with a future Warsaw date/time stores the correct UTC `starts_at` (winter and summer date) — with the dev server running, POST to `/api/groups/events` and compare the row's UTC value with the Warsaw offset for that date
- A spring-forward gap time redirects with `error=invalid_event_start` — e.g. last Sunday of March, 02:30

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Terminy card on the group page and smoke test

### Overview

Show events to members, give admins the controls, and cover the flow in the smoke test.

### Changes Required:

#### 1. Admin event row island

**File**: `src/components/groups/EventItem.tsx`

**Intent**: Admin-only row for an upcoming event with read mode ("Edytuj" / "Usuń") and an inline edit form, styled and structured like `src/components/groups/ChildItem.tsx`.

**Contract**: Props `{ groupId, eventId, label (formatted start), note, date, time }`. Edit form posts `group_id, event_id, date, time, note` to `/api/groups/events/update`, prefilled from `date`/`time`/`note`; delete posts to `/api/groups/events/delete` behind `window.confirm("Usunąć termin <label>? Deklaracje tego terminu też zostaną usunięte.")`. Inputs and buttons `min-h-11`; classes merged with `cn()`.

#### 2. Group page card

**File**: `src/pages/groups/[id].astro`

**Intent**: Add the "Terminy" card above "Dzieci" (events are what members open the page for), with per-card feedback.

**Contract**:
- Load with `listGroupEvents` in a `try/catch` like children; on failure the card shows "Nie udało się wczytać terminów." and the page still renders.
- `splitEvents(events, new Date())`; upcoming as a list (formatted start + note; admins get `EventItem client:load`), empty → "Brak nadchodzących terminów."; past in `<details>` "Minione terminy (N)" (hidden when N = 0), newest first, plain read-only rows for everyone (no `EventItem`).
- Admin create form: `date` (`<input type="date">`, `min` = today in Warsaw), `time` (`<input type="time">`), note (`maxlength="200"`, optional), submit "Dodaj termin"; labels visible; all controls `min-h-11`.
- Feedback: route codes via `feedbackSection`, show event feedback inside `#terminy` (same markup as the children card), keep banner for the rest. Card `id="terminy"` with `scroll-mt-4`.

#### 3. Smoke test

**File**: `scripts/smoke.mjs`

**Intent**: Cover the event flow from both roles, in write mode only (skipped under `SMOKE_READONLY=1`).

**Contract**: As the stranger (member), in its joined session before "stranger signs out" — group page shows the Terminy card but no create form (no "Dodaj termin"); POST to `/api/groups/events` with a valid future Warsaw date/time (so zod passes and RLS is what refuses) → 404. As the smoke user (group admin), after "designated admin signs in again" — add an event at a future Warsaw date/time with a unique note → `message=event_added`; add the same date/time again → `error=duplicate_event`; add a past date → `error=invalid_event_start`; group page contains the note; edit the event (read `event_id` from the page like `childIdAfterName`) → `message=event_updated`; delete it → `message=event_deleted` and the page no longer contains it; malformed `group_id` → 404.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Build passes: `npm run build`
- Smoke test passes against a local server: `npm run smoke`
- Database tests still pass: `npx supabase test db`

#### Manual Verification:

- At 360 px: no horizontal scroll, controls usable without zooming, touch targets at least 44 px — Terminy card create form and Edytuj/Usuń
- As admin: create, edit, delete upcoming; past events read-only; errors appear inside the Terminy card — past events inside "Minione terminy" with no Edytuj/Usuń; duplicate and past-date errors after the redirect
- As a plain member: list visible, no admin controls — no create form, no Edytuj/Usuń
- Displayed times match the Warsaw time entered (date after DST change)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No unit-test framework in the repo (AGENTS.md). The time helpers are exercised through Phase 2 manual checks and the smoke steps; DST edge cases are listed explicitly there.

### Integration Tests:

- pgTAP `supabase/tests/events_rls.test.sql`: isolation across groups, admin-only writes, future-only insert/update, started events neither updatable nor deletable, `created_by` pinned to the caller, uniqueness, note length, column grants.
- Smoke: admin create/duplicate/past/edit/delete; member read-only and 404 on create.

### Manual Testing Steps:

1. As group admin, add an event next Tuesday 17:00 with note "sala B"; it appears first under Terminy.
2. Add the same date/time again; see "Termin o tej dacie i godzinie już istnieje" inside the card.
3. Edit it to 17:30; list shows the new time. Delete it after confirming the dialog.
4. Insert a past event via SQL; it shows only under "Minione terminy", with no Edytuj/Usuń.
5. Sign in as a member; list visible, no admin controls; check 360 px layout.

## Performance Considerations

PRD scale is hundreds of events per group per season; one indexed query per group page load, rendering all rows, is fine. No pagination.

## Migration Notes

New table only; no existing data. Rollback = drop the table (no other object depends on it until S-06/S-07).

## References

- Roadmap item: `context/foundation/roadmap.md` (S-05), issue #8; timezone decision: issue #14 (Europe/Warsaw)
- PRD: `context/foundation/prd.md` FR-011, FR-012, Business Logic → Generator terminów, Zakończenie terminu
- Similar implementation: `supabase/migrations/20261112140000_create_children.sql`, `src/lib/services/children.ts:25`, `src/pages/api/groups/children.ts`, `src/components/groups/ChildItem.tsx`, `supabase/tests/children_rls.test.sql`
- Prior plan: `context/archive/2026-11-12-parent-adds-child/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Events table and RLS tests

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh database: `npx supabase db reset` — 1a9836c
- [x] 1.2 All database tests pass, including the new file: `npx supabase test db` — 1a9836c

#### Manual

- [x] 1.3 Migration file reviewed: four policies, column grant after the table-wide revoke, no client write path other than the policies — 1a9836c

### Phase 2: Server side — types, time helpers, validation, service, endpoints

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 70e3db7
- [x] 2.2 Type checking passes: `npx astro check` — 70e3db7
- [x] 2.3 Build passes: `npm run build` — 70e3db7

#### Manual

- [x] 2.4 Admin POST with a future Warsaw date/time stores the correct UTC `starts_at` (winter and summer date) — 70e3db7
- [x] 2.5 A spring-forward gap time redirects with `error=invalid_event_start` — 70e3db7

### Phase 3: Terminy card on the group page and smoke test

#### Automated

- [x] 3.1 Linting passes: `npm run lint`
- [x] 3.2 Type checking passes: `npx astro check`
- [x] 3.3 Build passes: `npm run build`
- [x] 3.4 Smoke test passes against a local server: `npm run smoke`
- [x] 3.5 Database tests still pass: `npx supabase test db`

#### Manual

- [x] 3.6 At 360 px: no horizontal scroll, controls usable without zooming, touch targets at least 44 px
- [x] 3.7 As admin: create, edit, delete upcoming; past events read-only; errors appear inside the Terminy card
- [x] 3.8 As a plain member: list visible, no admin controls
- [x] 3.9 Displayed times match the Warsaw time entered (date after DST change)
