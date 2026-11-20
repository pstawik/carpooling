# Logowanie nieoczekiwanych odmów (G-1, G-2) — Plan Brief

> Full plan: `context/changes/log-unexpected-refusals/plan.md`

## What & Why

Odmowy z bazy w `src/pages/api/groups/**` i brak własnego członkostwa w `getGroupWithAdmins`
dają dziś cichy 404. Zepsuta polityka RLS albo odebrane `EXECUTE` na RPC wyłącza podstawową akcję
PRD (deklaracja dziecka lub kierowcy) dla wszystkich i nie zostawia śladu. To krok 2 planu
poprawek observability (G-1 krytyczne, G-2 wysokie).

## Starting Point

Logowana jest tylko gałąź `unknown` (`console.error("<op> failed:", …)`). Wzorzec białej listy
pól istnieje w `src/lib/auth-error.ts` (krok 1). `isAppAdmin` nie jest liczone na `/groups/*`.

## Desired End State

Każda odmowa po zapytaniu do bazy wypisuje `"unexpected refusal:"` z obiektem
`{ event: "unexpected_refusal", op, code, message, groupId?, eventId?, childId?, userId }`,
na poziomie `error` dla przypadków „should not happen” i `warn` dla reszty. Użytkownik dalej
widzi 404, a odpowiedzi HTTP się nie zmieniają.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Zakres | Wszystkie gałęzie forbidden/0 wierszy/`not_found` w `api/groups/**` | Pełne pokrycie G-1, bo każda polityka może się zepsuć. |
| Poziomy | `error` dla `driver.ts:89` i `attendance.ts:52` na nadchodzącym terminie oraz G-2, `warn` dla reszty | Alert może celować w `error`, a odmowy dla obcych zostają do odfiltrowania. |
| Kształt logu | Obiekt z białą listą pól i stałym `event: "unexpected_refusal"` | Zgodny z kształtem kroku 4, więc tamten krok tylko rozszerzy helper. |
| G-2: rola app admina | RPC `is_app_admin` wołane tylko na gałęzi „grupa widoczna, brak członkostwa” | Zero kosztu na normalnej ścieżce i brak fałszywych wpisów od app adminów. |
| Błąd RPC `is_app_admin` | Log `error` mimo to | Rola jest nieznana, więc stan traktujemy jako nieoczekiwany. |
| Dowód | Vitest na czystych funkcjach + ręczny test na `npm run dev`, smoke bez zmian | Zgodne z test-plan §6.4, bo smoke nie czyta logów serwera. |

## Scope

**In scope:** `src/lib/refusal-log.ts` + test; 13 gałęzi w 10 plikach `src/pages/api/groups/**`;
`getGroupWithAdmins` + czysta funkcja `missingMembershipLogLevel` + test.

**Out of scope:** zmiana statusów (krok 4), przepięcie istniejących `console.error` (krok 4),
`cause` w serwisach (krok 3), `api/admin/**`, `join.ts`, błędy walidacji wejścia, zmiany w middleware.

## Architecture / Approach

Trasa → `logUnexpectedRefusal(level, op, outcome.error, ids)` → `console[level]` z polami z
`refusalLogFields` (tylko `code`, `message` z błędu oraz UUID) → `rewrite("/404")` jak dziś.
`getGroupWithAdmins` przy grupie bez `me` → `is_app_admin` → `missingMembershipLogLevel` → log → `null`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Helper i odmowy w API (G-1) | Helper z testem, log na 13 gałęziach | Złe rozbicie `attendance.ts:52` (zablokowany vs obcy vs nadchodzący) |
| 2. Brak własnego członkostwa (G-2) | Log w `getGroupWithAdmins` bez fałszywych alarmów | Ręczna symulacja ukrytego wiersza `group_members` w lokalnej bazie |

**Prerequisites:** krok 1 (`middleware-auth-error-logging`) zarchiwizowany; `npx supabase start` do testów ręcznych.
**Estimated effort:** ~1 sesja, 2 fazy, mały PR.

## Open Risks & Assumptions

- Warn-y od spreparowanych id (obcy użytkownicy) dodają szum. Filtr to poziom `warn` i `event`.
- `message` z PostgREST dla `42501`/`23503` nie zawiera PII. `details` (z wartościami kluczy)
  celowo nie jest logowane.

## Success Criteria (Summary)

- Zepsuta polityka albo odebrany `EXECUTE` na RPC deklaracji daje wpis `error` w Workers Logs zamiast ciszy.
- Członek bez widocznego wiersza członkostwa zostawia wpis, a app admin nie.
- Użytkownik widzi te same 404 i komunikaty co dziś, a smoke przechodzi bez zmian.
