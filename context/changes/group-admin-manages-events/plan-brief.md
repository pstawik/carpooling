# Group admin manages events — Plan Brief

> Full plan: `context/changes/group-admin-manages-events/plan.md`

## What & Why

Roadmap S-05 (FR-011, FR-012): a group admin creates, edits and deletes single events (terminy), and every member sees the group's events as a list starting from the nearest upcoming one. It also fixes how an event's start moment is stored — the declaration lock (S-07, S-08), the weekly generator (S-06) and statistics (S-09) all key off it.

## Starting Point

Groups, memberships, invite links and children exist; there is no events table. The children slice set the pattern this plan copies: per-operation RLS policies, a thin service mapping PostgREST errors to codes, zod-validated form POSTs redirecting with codes, and a card on `/groups/[id]` with a small React island. `is_group_member` / `is_group_admin` helpers already exist. Timezone was decided as Europe/Warsaw (issue #14).

## Desired End State

`/groups/[id]` has a "Terminy" card: upcoming events ascending (Warsaw date, weekday, time, optional note) and a collapsed "Minione terminy" list, newest first. Group admins get a create form and inline Edytuj/Usuń on upcoming events; started events are read-only. The database alone enforces who can read and write, future-only starts, no edits or deletes after start, and no duplicate start moments.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Timezone | Europe/Warsaw, stored as `timestamptz` | Decided in issue #14; one instant drives lock and stats | Roadmap |
| Event fields | `starts_at` + optional note (≤ 200 chars) | Group name names the activity; note covers one-off changes | Plan |
| Duplicates | Reject: unique `(group_id, starts_at)` | PRD duplicate rule, enforced once, reused by S-06 | Plan |
| After start | Neither edit nor delete (RLS) | Finished events and their declarations feed stats; changing them would rewrite history | Plan review F1 |
| Past starts | Create/edit need a future start (RLS + zod) | Events are born upcoming, never pre-locked | Plan |
| Placement | "Terminy" card on the group page, above Dzieci | Reuses page, anchor feedback and island patterns | Plan |
| Past events | Collapsed `<details>` "Minione terminy" | Default view is FR-011; history and cleanup stay reachable | Plan |
| Write path | RLS policies, not RPCs | Same as children; satisfies the per-operation RLS rule | Plan |
| "Upcoming" | `starts_at > now()` | Same moment PRD uses for "finished" and the lock | PRD |

## Scope

**In scope:** events table + RLS + pgTAP tests; Warsaw ↔ UTC helpers (DST-gap rejection); zod schemas; events service; create/update/delete endpoints; Terminy card with admin island; Polish messages; smoke steps for admin and member.

**Out of scope:** weekly generator (S-06); end time / location / title; per-event plan page (S-07); backfilling past events; app-admin access to non-member groups; pagination or calendar.

## Architecture / Approach

Form (date + time + note, Warsaw) → endpoint (zod converts to a UTC instant, rejects non-existent or past times) → `events` service via the caller's RLS-scoped Supabase client → `public.events` policies (`is_group_member` read; `is_group_admin` + `starts_at > now()` insert/update/delete) → redirect `?message|error=<code>#terminy` → group page splits events at `now` and renders them in Warsaw time.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Events table and RLS tests | Migration + `events_rls.test.sql` | Policy gap letting a member write or a started event move |
| 2. Server side | Types, time helpers, zod, service, 3 endpoints, messages | Wrong CET/CEST offset or DST-gap handling |
| 3. Terminy card + smoke | Card, `EventItem` island, per-card feedback, smoke steps | 360 px layout of date/time inputs and row buttons |

**Prerequisites:** S-02 done (it is); local Supabase running for tests and smoke.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- An admin submitting right at the start boundary passes zod but fails RLS with `42501`, which renders 404 — accepted as a negligible race.
- `event_not_found` on update covers both "not yours" and "already started"; the message names both.
- S-07/S-08 must add declaration FKs to `events` with `on delete cascade` (FR-012 accepts lost declarations).

## Success Criteria (Summary)

- A group admin creates, edits and deletes events from the phone; duplicates and past times are refused with a clear message.
- Members see upcoming events first and past ones on demand; non-members see nothing.
- pgTAP and smoke tests prove the rules hold without the UI.
