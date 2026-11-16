<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Deklaracja kierowcy i bilans miejsc

- **Plan**: context/changes/driver-declaration-seat-balance/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence:
- Plan drift: every planned item is MATCH; no DRIFT or MISSING items.
- Accepted adaptations, none of which changes behaviour:
  - `p_seats integer` instead of `smallint`;
  - `src/lib/plural.ts`, now also used by `eventsNoun`;
  - the load-error text;
  - smoke checks narrowed to the `#bilans` and `#kierowcy` sections.
- Benign extras:
  - additional pgTAP cases;
  - a `getGroupEvent` failure in the endpoint redirects to `?error=unknown`;
  - before the event starts, "Jedziesz jako kierowca: M" shows above the form.
- Gates:
  - `npx supabase test db`: PASS (7 files, 277 tests), re-run during the review.
  - lint, `astro check`, build and smoke: PASS on 897c4d5's code, run by the user.
  - Manual checks 1.3, 2.4 and 3.5–3.8 were confirmed by the user in the session.
- Unplanned files in the diff:
  - `.claude/.10x-cli-manifest.json` (the user chose to stage it in p2);
  - `context/foundation/roadmap.md` (the S-08 status flip in p1).

## Findings

### F1 — A removed member's driver row keeps counting in the seat balance

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261113130000_create_event_drivers.sql:119-132; src/pages/groups/[id]/terminy/[eventId].astro:55-60
- **Detail**:
  - A member is removed by a manual `delete from public.group_members` (README.md:173).
  - Their `event_drivers` rows on future events stay.
  - Every write policy requires `is_group_member`, and there is no admin delete policy, so nobody in the app can remove those rows.
  - The plan shows the row as "Członek grupy" with no phone, but `buildSeatBalance` still counts its seats. The page can say "Miejsc wystarcza" while those seats do not exist.
  - The plan parks this under FR-007 (plan.md "What We're NOT Doing"). The risk is that the balance is wrong, not just that a row is visible.
- **Fix A ⭐ Recommended**: Add a `delete from public.event_drivers where user_id = … and group_id = … and event_id in (select id from public.events where starts_at > now())` line to the README removal snippet.
  - Strength: Removal is already a manual SQL step, so this one line closes the gap where it starts. No code or migration change.
  - Tradeoff: It depends on whoever removes a member following the README.
  - Confidence: HIGH. README.md:173 is the only removal path today.
  - Blind spot: FR-007 may later bring an in-app removal that needs a trigger anyway.
- **Fix B**: Leave the rows alone and skip drivers with an invisible profile (`nick === null`) in `listEventDrivers` and the balance.
  - Strength: Protected in the code, whoever removes the member.
  - Tradeoff: Rows still pile up in the database. It relies on the side effect that `shares_group_with` makes the profile invisible.
  - Confidence: MED. It depends on the semantics of the profiles RLS policy.
  - Blind spot: A removed member who still shares another group with the viewer stays visible and would still be counted.
- **Decision**: FIXED via Fix A. The README member-removal snippet now deletes the member's driver declarations on upcoming events first.

### F2 — Wrong Polish verb for 5 or more children in the balance

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (plan-level copy)
- **Location**: src/pages/groups/[id]/terminy/[eventId].astro:68-71
- **Detail**: `goingLabel` uses "Jadą" for every count ≥ 2, so it outputs "Jadą 5 dzieci" and "Jadą 21 dzieci". The implementation follows the plan to the letter, but Polish takes the singular verb with numerals of 5 and above ("Jedzie 5 dzieci"). 2–4 are fine as "Jadą" ("Jadą 2 dzieci"). The smoke test only checks "Jedzie 1 dziecko".
- **Fix**: Choose the verb with `pluralPl(count, "Jedzie", "Jadą", "Jedzie")` and update the doc comment ("Jedzie 5 dzieci").
- **Decision**: FIXED. `goingLabel` now chooses the verb with `pluralPl`.
