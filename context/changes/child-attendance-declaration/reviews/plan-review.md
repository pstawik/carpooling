<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Deklaracja obecności dziecka i plan dzieci terminu

- **Plan**: context/changes/child-attendance-declaration/plan.md
- **Mode**: Deep
- **Date**: 2026-11-13
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding
6/6 paths ✓, 5/5 symbols ✓, brief↔plan ✓

Weryfikacja w kodzie:
- istniejące testy pgTAP sprawdzają tylko `policies_are` per tabela, więc nowe ograniczenia ich nie łamią;
- domyślne granty Supabase są zgodne z założeniami planu;
- `EventItem` jest używany tylko w `src/pages/groups/[id].astro`.

Na podstawie wiedzy o Postgresie (bez uruchomienia na żywej bazie): `ON CONFLICT DO UPDATE` pod RLS rzuca błąd zamiast cicho pomijać wiersz, a kaskady FK omijają RLS i granty.

## Findings

### F1 — Kroki smoke zakładają aktorów i dane, których nie ma

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Smoke
- **Detail**: W `scripts/smoke.mjs`:
  - pojedynczy termin jest usuwany w :380-383;
  - terminy z generatora (:400-402) nie mają notatki, więc nie da się wyciągnąć ich id;
  - event_id jest w HTML tylko w widoku admina;
  - po :260 nie ma już nie-członka.
- **Fix**: Doprecyzować kontrakt smoke: osobny termin z unikalną notatką, dziecko `childRenamed`, admin jako „inny członek”, nowy użytkownik `smoke-outsider-*`.
- **Decision**: FIXED

### F2 — Przesłanianie nazw kolumn w podzapytaniach polityk

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Migracja
- **Detail**: W `exists (select 1 from public.children c where …)` niekwalifikowane `group_id` oznacza `c.group_id`, więc warunek byłby zawsze prawdziwy. Plan kwalifikuje to tylko w polityce insert.
- **Fix**: Reguła w „Critical Implementation Details”: kwalifikować kolumny `child_attendance` w podzapytaniach każdej polityki.
- **Decision**: FIXED
