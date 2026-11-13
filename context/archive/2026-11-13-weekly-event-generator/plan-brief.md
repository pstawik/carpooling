# Weekly event generator — Plan Brief

> Full plan: `context/changes/weekly-event-generator/plan.md`

## What & Why

Roadmap S-06 (FR-013): a group admin generates weekly events (terminy) on a chosen weekday, within a date range and at a given Warsaw time, without duplicates. Each generated event is independent and can be edited or deleted on its own. This saves the admin from adding a season of events one by one.

## Starting Point

S-05 already provides the `events` table, RLS that allows inserts only by a group admin and only for future starts, the unique `(group_id, starts_at)` index (the PRD duplicate rule), Warsaw ↔ UTC helpers, the zod/endpoint/feedback patterns, and the Terminy card. Nothing yet creates more than one event per request.

## Desired End State

A collapsed "Generuj terminy cotygodniowe" section in the Terminy card (admins only) takes a weekday, a time, and start and end dates. The end date is included and may be at most 366 days after the start. Submitting creates one event per matching future date and skips the ones that exist already or have already started. The admin sees, for example, "Dodano 12 terminów, pominięto 2 (istniały już albo minęły)". The database alone stops non-admins.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Duplicates | `INSERT … ON CONFLICT (group_id, starts_at) DO NOTHING RETURNING id` | Reuses the existing unique index and insert policy in one all-or-nothing statement, with no migration |
| Past dates in range | Skip and count them | The admin gets the useful part of the series; filtering first is needed anyway, since one past row makes RLS reject the batch |
| Range cap | End date at most 366 days after start (≤ 53 events) | Covers a season, and a year typo cannot flood the list |
| Range ends | Both start and end dates included | Natural reading of "mieszczące się w zakresie dat" |
| Feedback | Created + skipped counts with Polish plurals | Makes "bez duplikatów" visible; digits-only params, validated on read |
| Note | No note field; generated events have `note = null` | Notes are for one-off changes (S-05) |
| Placement | Collapsed `<details>` in the Terminy card | Reuses the card, `#terminy` feedback and patterns; keeps the 360 px card short |
| DST-gap date | Skipped and counted | `warsawLocalToUtc` rejects it; same treatment as other skips |
| Invalid form / weekday not in range | One code, `invalid_event_series` | One clear message for every user-editable mistake |

## Scope

**In scope:**
- `weeklyDates` helper.
- `generateEvents` service.
- pgTAP cases for ON CONFLICT under RLS.
- zod schema.
- `POST /api/groups/events/generate`.
- Codes and plural message.
- Collapsed form.
- Smoke steps.

**Out of scope:**
- Note field.
- Preview step.
- Series entity, bulk edit or delete.
- Several weekdays per run.
- Migrations and new policies.
- Ranges longer than 366 days.

## Architecture / Approach

Form (weekday, time, start and end dates) → zod (`dates = weeklyDates(...)`, non-empty, within the cap) → `generateEvents`:

1. Convert each date with `warsawLocalToUtc`.
2. Keep only starts more than 60 s after `now`.
3. Run one `upsert(..., { ignoreDuplicates: true }).select("id")` through the caller's RLS-scoped client.

Then: redirect `?message=events_generated&created=n&skipped=m#terminy` → the card renders the plural message.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Date generation and DB proof | `weeklyDates`, `generateEvents`, pgTAP ON CONFLICT cases | Weekday off-by-one, or ON CONFLICT behaving differently under RLS |
| 2. Endpoint and messages | Schema, endpoint, `invalid_event_series` / `events_generated`, plurals | Field errors mapped to 404 instead of a friendly message |
| 3. Generator form and smoke | Collapsed form, count rendering, smoke steps | 360 px layout of four inputs |

**Prerequisites:** S-05 done (it is); local Supabase running for pgTAP and smoke.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- A start inside the 60 s boundary between filter and insert would fail RLS → 404 for the whole batch. Accepted, like S-05.
- The skipped count does not say why each date was skipped (duplicate, past, or DST gap). The message wording covers the common cases.
- Assumes PostgREST's `ignoreDuplicates` emits `ON CONFLICT … DO NOTHING`. Phase 1 pgTAP proves the SQL; smoke proves the client call.

## Success Criteria (Summary)

- A group admin generates a season of weekly events from the phone in one submit and sees how many were added and skipped.
- Re-running the same series adds nothing; non-admins cannot generate.
- pgTAP and smoke prove the rules hold without the UI.
