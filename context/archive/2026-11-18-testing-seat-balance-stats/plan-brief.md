# Bilans miejsc i statystyki na danych granicznych — Plan Brief

> Full plan: `context/changes/testing-seat-balance-stats/plan.md`
> Research: `context/changes/testing-seat-balance-stats/research.md`

## What & Why

Faza 1 planu testów (ryzyka #1 i #6). Dowodzimy na ręcznie policzonych przykładach z PRD, że
ostrzeżenie o niedoborze miejsc i statystyki zaangażowania liczą poprawnie na danych granicznych.
Research wykazał lukę produktu: usunięty z grupy kierowca nadal dokłada miejsc na przyszłych terminach,
więc plan może pokazać „Miejsc wystarcza”, choć auta nie będzie.

## Starting Point

Bilans liczą czyste funkcje TS (`buildSeatBalance`, `buildChildPlan`), pokryte tylko smoke z jednym
kierowcą. W projekcie nie ma runnera unit. Statystyki liczą funkcje SQL z jednym plikiem pgTAP, bez granic
czasowych i bez byłych członków. Usunięcie z `group_members` nie rusza deklaracji.

## Desired End State

`npm test` (Vitest) działa lokalnie i w CI. Usunięcie członka kasuje jego deklaracje kierowcy i deklaracje
jego dzieci na przyszłych terminach grupy, a historia zostaje. pgTAP pokrywa granice statystyk, a wymaganie
PRD dla byłych członków czeka jako `todo` na fazę 2. Wzorzec testu reguły liczenia jest w `test-plan.md` §6.1.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Warstwa bilansu | Vitest na czystych funkcjach | Logika jest w TS i nie potrzebuje bazy | Research |
| Warstwa statystyk | pgTAP | Logika jest w SQL pod RLS | Research |
| Luka usuniętego członka | Naprawa w bazie: trigger `after delete on group_members` + pgTAP | PRD `:147` i Hard Rules: reguła po stronie serwera, niezależnie od UI | Plan |
| „Przyszły termin” | `starts_at > now()` | Dopełnienie „zakończony”; termin w chwili usunięcia zostaje | Plan |
| Byli członkowie w statystykach | Test `todo`, naprawa w fazie 2 | To ryzyko #2 (statystyki zmieniają się wstecz) | Plan |
| Wyrocznia statystyk | Przejazd wymaga ≥1 jadącego dziecka; zakres dziecka od `created_at` | Potwierdzone decyzje S-09, zapisane w §6.1 | Plan |
| Runner | Vitest + `npm test` + krok w jobie `ci` | Zgodny z Vite, wskazany w test-plan §4–§5 | Plan |

## Scope

**In scope:**
- Vitest, unit testy bilansu i planu dzieci, krok CI
- Migracja z triggerem usuwania przyszłych deklaracji + pgTAP
- pgTAP granic statystyk z `todo` dla byłych członków
- `test-plan.md` §6.1 / §3–§5 i AGENTS.md (Commands, Testing)

**Out of scope:**
- Zmiana `group_driver_stats` dla byłych członków (faza 2)
- UI usuwania członków (FR-007) i los dzieci usuniętego rodzica
- Granica blokady zapisu i strefy czasowe (ryzyko #4)
- Licznik zakończonych terminów na zegarze Workera, zmiany PRD, e2e, smoke

## Architecture / Approach

Każda reguła jest testowana w swojej warstwie: TS → Vitest, SQL → pgTAP. Liczby oczekiwane pochodzą
z rachunku w komentarzu fixture (np. „1 < 2 → brakuje 1”), nigdy ze wzoru w kodzie. Każda faza kończy się
celowym zepsuciem granicy (`<` → `<=`, `>` → `>=`), które musi dać czerwony test.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Vitest i testy bilansu | Runner, 2 pliki testów, krok CI | Konfiguracja Vitest koliduje z lintem / `astro check` |
| 2. Usunięcie członka czyści przyszłe deklaracje | Migracja z triggerem + pgTAP | Trigger przy kaskadach (usunięcie profilu / grupy) |
| 3. Statystyki na granicach | Nowy plik pgTAP z ręcznym fixture | Granice `now()` / `created_at` źle ustawione w fixture |
| 4. Dokumentacja | §6.1, statusy, AGENTS.md | — |

**Prerequisites:** lokalny Supabase (`npx supabase start`), Node zgodny z CI.
**Estimated effort:** ~2 sesje, 4 fazy.

## Open Risks & Assumptions

- Wiersze byłych członków usuniętych technicznie przed migracją zostają. Migracja nie czyści danych wstecz.
- Dzieci usuniętego rodzica zostają w grupie i pokażą się jako „bez deklaracji” (decyzja przy FR-007).
- Faza 2 planu testów musi uwzględnić nowy trigger przy testach trwałości historii.

## Success Criteria (Summary)

- Przy liczbie dzieci „jedzie” większej niż suma miejsc, także po usunięciu kierowcy, plan pokazuje ostrzeżenie, co dowodzą testy na ręcznych przykładach.
- Statystyki zgadzają się z ręcznie policzonym fixture na granicach czasu i zakresu dziecka.
- Unit i pgTAP są bramkami w CI.
