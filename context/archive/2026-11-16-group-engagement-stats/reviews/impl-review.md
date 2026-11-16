<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Statystyki zaangażowania grupy

- **Plan**: context/changes/group-engagement-stats/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated checks (2026-11-16): `npm run lint` OK, `npx astro check` 0 errors, `npm run build` OK, `npx supabase test db` PASS (8 files, 295 tests), `npm run smoke` all steps passed. `npx supabase db reset` was not re-run because it would wipe local data; the migrations are already applied and the tests pass on them.

## Findings

### F1 — Licznik zakończonych terminów czyta wszystkie terminy i używa zegara Workera

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/groups/[id]/statystyki.astro:28-34
- **Detail**: `listGroupEvents` pobiera wszystkie terminy grupy (bez limitu) tylko po to, żeby policzyć `past.length` zegarem Workera, a listy liczą się z `now()` w bazie. Plan zaakceptował rozjazd zegarów i tę ścieżkę. Przy obecnej skali (kilkadziesiąt terminów rocznie) to nie jest problem.
- **Fix**: Zostawić. Ewentualnie później zastąpić zapytaniem `count: 'exact', head: true` z `lte('starts_at', …)` albo kolumną z RPC.
- **Decision**: FIXED — `countFinishedEvents` (count-only, `head: true`) w `src/lib/services/stats.ts` zastępuje `listGroupEvents` + `splitEvents` na stronie; zegar Workera bez zmian (zaakceptowany w planie)

### F2 — `group_driver_stats` zwraca adminowi aplikacji spoza grupy członków z zerami

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261116130000_create_engagement_stats.sql:36-56
- **Detail**: Admin aplikacji widzi `group_members` każdej grupy (`group_members_select_member_or_app_admin`), ale nie widzi terminów. Wywołany przez PostgREST, `group_driver_stats(Y)` zwraca mu więc `user_id` członków z `drives = 0`. To nie jest nowe ujawnienie danych, ale wynik wprowadza w błąd. Strona daje 404 wcześniej.
- **Fix**: Dodać `and public.is_group_member(p_group_id)` do `where` w `group_driver_stats` i test pgTAP dla admina spoza grupy.
- **Decision**: FIXED — warunek dodany w migracji (zmiana nie jest jeszcze na `main`); w teście C dostaje rolę app admina przed swoim blokiem

### F3 — Nowe przypadki w `children_rls.test.sql` są po bloku „A deletes their own child”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/children_rls.test.sql:280-330
- **Detail**: Plan kazał wstawić nowe przypadki przed tym blokiem, żeby nie zmieniać stanu dalszych asercji. Są po nim, a licznik kaskady zmieniono z 2 na 3. Ten licznik jest poprawny, `plan(43)` się zgadza i testy przechodzą.
- **Fix**: Przyjąć bez zmian. Kolejność nie wpływa na poprawność.
- **Decision**: ACCEPTED — bez zmian w kodzie

### F4 — Brak testu izolacji G2 dla `group_child_stats`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/engagement_stats.test.sql
- **Detail**: Plan: „Dane G2 nie trafiają do wyników G1”. Izolację G2 sprawdza się tylko dla `group_driver_stats`. Dla `group_child_stats` chroni ją `where c.group_id = p_group_id` i RLS, ale żaden test tego nie pokazuje (np. że Kuba z G2 nie jest w wynikach G1).
- **Fix**: Dodać asercję, że `group_child_stats(G1)` nie zawiera dziecka z G2, i podbić `plan(14)` → `plan(15)`.
- **Decision**: FIXED — asercja `is_empty` dla A wywołującego `group_child_stats(G2)` (wynik G1 i tak sprawdza `results_eq` z dokładnym zbiorem); `plan(15)`
