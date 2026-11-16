<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Deklaracja kierowcy i bilans miejsc

- **Plan**: context/changes/driver-declaration-seat-balance/plan.md
- **Mode**: Deep
- **Date**: 2026-11-13
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

5/5 paths ✓ (src/types.ts, src/lib/services/group-errors.ts, src/pages/api/groups/events/attendance.ts, src/pages/groups/[id]/terminy/[eventId].astro, scripts/smoke.mjs), 5/5 symbols ✓ (getGroupEvent, hasStarted, eventsNoun, shares_group_with, events_id_group_unique), brief↔plan ✓, Progress↔Phase 3/3 phases, 15/15 rows ✓

## Findings

### F1 — Kroki smoke kłócą się z faktycznym stanem skryptu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Smoke
- **Detail**: Kroki S-07 kończą się dzieckiem w stanie „nie jedzie” (`smoke.mjs:533-541`), admin jest wylogowany (`:515`), a obcy powstaje dopiero na `:549`. Plan zakładał N=1 i ponowne logowanie admina, zostawiając sekwencję jako „dopasować kolejność”.
- **Fix**: Rozpisać sekwencję: po `:546` jako rodzic going=true → set 2 → seats=9 → błędny event_id → withdraw; obcy POST set → 404 w sekcji `:549-554`; widoczność dla innego członka zostaje w pgTAP i teście ręcznym 3.6.
- **Decision**: FIXED

### F2 — Sprzeczne brzmienie tekstu bilansu

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State vs Phase 3 — Strona planu (odmiana)
- **Detail**: „Jadą N dzieci · Miejsc M” kontra reguła mianownika „1 miejsce / 2 miejsca” i „Jedzie 1 dziecko”.
- **Fix**: Jeden format „Jedzie 1 dziecko / Jadą 3 dzieci · 1 miejsce / 2 miejsca / 5 miejsc” w planie i briefie.
- **Decision**: FIXED

### F3 — Brak domyślnej wartości pola miejsc bez deklaracji

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Strona planu, „Twój przejazd”
- **Detail**: Plan nie określał zawartości pola, gdy deklaracji jeszcze nie ma.
- **Fix**: Puste pole z placeholderem „np. 3”; przy istniejącej deklaracji bieżąca wartość.
- **Decision**: FIXED
