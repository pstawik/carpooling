# Trwałość historii i granica startu terminu — Plan Brief

> Full plan: `context/changes/testing-history-durability-start-boundary/plan.md`
> Research: `context/changes/testing-history-durability-start-boundary/research.md`

## What & Why

Faza 2 planu testów (ryzyka #2 i #4). Chcemy udowodnić, że deklaracje stają się tylko do odczytu
dokładnie w chwili startu terminu, że godzina terminu to czas warszawski po obu stronach zmiany
czasu, i że usunięcia nie zmieniają statystyk zakończonych terminów — bo od tego zależy, czy
rodzice mogą ufać planowi i statystykom.

## Starting Point

Baza egzekwuje blokadę poprawnie (`starts_at > now()` we wszystkich 7 predykatach zapisu), ale
testy sprawdzają ją tylko na terminie sprzed doby. Konwersja czasu (`src/lib/time.ts`,
`weekly-events.ts`) nie ma żadnych testów. Usunięcia zachowują wiersze deklaracji, ale
`group_driver_stats` pomija byłych członków (luka G1, dziś pgTAP `todo`).

## Desired End State

CI czerwienieje, gdy blokada przesunie się o sekundę, gdy konwersja czasu pomyli CET z CEST albo
gdy usunięcie zmieni statystyki zakończonych terminów. Były członek z zaliczonymi przejazdami
zostaje w statystykach kierowców. Cookbook §6.2 opisuje, jak pisać takie testy.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| G1: byli członkowie w statystykach kierowców | Naprawa migracją `create or replace group_driver_stats`; `todo` → asercja | PRD `prd.md:147` wymaga zachowania; test ma pilnować wymagania, nie obecnego zachowania | Plan |
| Którzy byli członkowie są listowani | Tylko z ≥ 1 zaliczonym przejazdem; obecni zawsze | Były członek z 0 przejazdami nie ma historii do zachowania | Plan |
| Nick byłego członka | Bez zmian — fallback „Członek grupy” | RLS profili ukrywa nick; etykieta „Były członek” poza zakresem | Plan |
| G4: dzieci usuniętego rodzica | Wymaganie FR-007 w roadmapie, bez testu | Bez zapisanej chwili usunięcia nie ma wyroczni dla `todo` | Plan |
| G2 / G3 | Udokumentowane kompromisy, bez testów | Zgodne z decyzjami S-09; brak testu utrwalającego kompromis | Research / Plan |
| Warstwa dla DST | Vitest na `time.ts`, `weeklyDates`, `hasStarted` | Baza nie konwertuje stref; czyste funkcje to najtańszy sygnał | Research |
| „Kontrolowany czas” w pgTAP | `starts_at = now()` / `now() + 1 s` w jednej transakcji | `now()` stałe w transakcji — deterministyczne | Research |
| Dokumentacja | §6.2 + §6.5, roadmap #14 i FR-007; §2 przez backport `/10x-test-plan` | Plan zmienia tylko swoje sekcje | Plan |

## Scope

**In scope:**
- pgTAP granicy blokady dla INSERT/UPDATE/DELETE i obu RPC
- Vitest: `warsawLocalToUtc`, `utcToWarsawParts`, `formatEventStart`, `weeklyDates`, `hasStarted`
- Migracja G1 i asercja byłych członków
- pgTAP migawki statystyk przed/po usunięciach
- §6.2, §6.5, roadmap #14 i FR-007

**Out of scope:**
- G2, G3, G4 jako testy lub zmiany zachowania
- Etykieta „Były członek”, test `generateEvents` z mockiem, ICU w workerd
- Korekta §2 test-plan (backport w `/10x-test-plan`)

## Architecture / Approach

Granica czasu jest jedna: baza egzekwuje `> now()` / `<= now()`, TS ma dopełnienie tylko do
komunikatów, a strefa istnieje wyłącznie na krawędzi TS. Dlatego granicę testujemy w pgTAP,
strefę w Vitest. Wyrocznia: PRD i kalendarz zmian czasu 2026 (29 marca, 25 października), nigdy
kod. Każda faza testowa kończy się celowym zepsuciem operatora.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Granica blokady zapisu | `declaration_lock_boundary.test.sql` | Ścieżka konfliktu RPC daje 42501, nie 0 wierszy — asercje muszą to rozróżniać |
| 2. Strefa i zmiana czasu | `time.test.ts`, `weekly-events.test.ts`, `events.test.ts` | Oczekiwania liczone testowaną funkcją (wyrocznia) |
| 3. Byli członkowie (G1) | Migracja + asercja zamiast `todo` | Jedyna zmiana produkcyjna; grants po `create or replace` |
| 4. Statystyki po usunięciach | `deletion_history_stats.test.sql` | Migawka trywialna (puste statystyki) — wymagane ręczne wartości |
| 5. Dokumentacja | §6.2, §6.5, roadmapa | Dryf względem §2 do czasu backportu |

**Prerequisites:** `npx supabase start`, Vitest z fazy 1 rolloutu, faza 3 przed fazą 4.
**Estimated effort:** ~2–3 sesje w 5 fazach.

## Open Risks & Assumptions

- Zakładamy pełne dane ICU `Europe/Warsaw` w workerd — Vitest w Node tego nie potwierdzi.
- Były członek dzielący inną grupę z oglądającym pokaże nick — zgodne z RLS, nie błąd.

## Success Criteria (Summary)

- Przesunięcie granicy blokady o sekundę lub pomyłka CET/CEST daje czerwony test w CI.
- Usunięcie przyszłego terminu, dziecka bez historii czy członka nie zmienia statystyk zakończonych terminów.
- Były członek z przejazdami nadal widnieje w statystykach kierowców.
