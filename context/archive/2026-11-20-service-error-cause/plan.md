# Zachowanie przyczyny błędu serwisów — plan implementacji

## Overview

Krok 3 planu poprawek observability (`context/audits/observability/2026-11-19_groups-fix-plan.md`), zamyka G-4, G-5 i P-3 z audytu `2026-11-19_groups.md`. Serwisy w `src/lib/services/*` przebudowują błąd PostgREST z samego `message`, więc kod (`57014` vs `PGRST301` vs `42P01`), `details` i `hint` giną na granicy serwisu, a część bloków `catch` loguje potem znowu tylko `message`. Po zmianie każdy rzucony błąd niesie kod w treści i pełny oryginał w `cause`, a logi dostają obiekt błędu albo `error.code`.

## Current State Analysis

- 12 miejsc ``throw new Error(`<op> failed: ${error.message}`)`` w serwisach, zero `cause` w całym `src/`. Tylko `invites.ts:19` ma już `code` w treści.
- 4 bloki `catch` logują `error instanceof Error ? error.message : error`, co gubi stos i (po tej zmianie) `cause`: `api/groups/events/attendance.ts:51`, `api/groups/events/driver.ts:85`, `pages/dashboard.astro:23`, `pages/join/[token].astro:22`.
- Middleware loguje samo `error.message` przy odczycie profilu (`src/middleware.ts:66`) i `is_app_admin` (`:76`). Ten sam wzorzec w `src/pages/admin/groups.astro:32`.
- Strony z sekcjami „degraded” (`groups/[id].astro:77,91`, `terminy/[eventId].astro:82`, `statystyki.astro:40`) już robią `console.error(loadError)` — zyskają `cause` bez zmian.
- Ścieżek `throw` nie pokrywa żaden test; testy serwisów sprawdzają tylko czyste funkcje mapujące.

## Desired End State

Każdy błąd odczytu z serwisu ma treść `<op> failed: <code> <message>` i `cause` równy oryginalnemu błędowi Supabase (poza `invite_group_name`, który z powodu tokena zostaje bez `cause`). Żaden `console.error` w `src/` nie loguje samego `message` bez kodu ani obiektu błędu. Format pilnuje test Vitest helpera.

### Key Discoveries:

- Wzorzec helpera z testem obok: `src/lib/refusal-log.ts` + `refusal-log.test.ts` (czyste funkcje, bez klienta Supabase).
- `refusal-log.ts:22-24` celowo nie kopiuje `details`/`hint` do logu z ID; tutaj trafiają tylko jako `cause` błędu serwisu, czego dotyczy wyjątek dla tokena zaproszenia.
- `tsconfig` dziedziczy target `ESNext` (`astro/tsconfigs/strict`), więc `new Error(msg, { cause })` działa bez zmian konfiguracji.
- Kod PostgREST bywa pustym stringiem (np. błąd sieci w `fetch`), więc helper musi go pomijać.
- Nie wiadomo, czy Workers Logs serializują `cause` przy `console.error(err)` (audyt §8) — stąd kod także w treści komunikatu.

## What We're NOT Doing

- Strukturalny helper `logError(...)` w JSON i pole `event` (krok 4, `structured-error-logs`).
- Logi tras zapisu (`"<op> failed:", code, message`) — już mają kod; ujednolica je krok 4.
- Zmiana statusu odpowiedzi dla gałęzi `unknown` (krok 4) ani poprawki P-2/G-8 (krok 5).
- `cause` w `getInviteGroupName` (`invites.ts:19`) — świadomie pominięty, żeby token zaproszenia nigdy nie trafił do logów przez `details`.
- Testy integracyjne ścieżek `throw` z fałszywym klientem Supabase — test-plan dopuszcza w Vitest tylko czyste funkcje.

## Implementation Approach

Jedna czysta funkcja buduje błąd w ustalonym formacie; 11 miejsc w serwisach ją wywołuje. Potem logi w `catch` i middleware przestają spłaszczać błąd do `message`.

## Phase 1: Helper i serwisy

### Overview

Dodaje `serviceError` z testem i przepina na niego 11 z 12 miejsc `throw` w serwisach.

### Changes Required:

#### 1. Helper

**File**: `src/lib/service-error.ts` (nowy), `src/lib/service-error.test.ts` (nowy)

**Intent**: Jedno miejsce, które z nazwy operacji i błędu Supabase buduje `Error` z kodem w treści i oryginałem w `cause`, żeby format był wszędzie taki sam i pod testem.

**Contract**: `serviceError(op: string, error: { code?: string; message?: string }): Error`. Treść: `<op> failed: <code> <message>`; gdy `code` jest pusty lub brak go — `<op> failed: <message>`. `cause` to dokładnie przekazany obiekt `error` (ta sama referencja). Test: kod + treść; pusty kod (bez podwójnej spacji); `cause` jest przekazanym obiektem.

#### 2. Serwisy

**File**: `src/lib/services/attendance.ts:38`, `children.ts:42`, `drivers.ts:40`, `events.ts:48,73`, `groups.ts:44,87`, `invites.ts:72`, `stats.ts:56,73,76`

**Intent**: Zamienić ``throw new Error(`<op> failed: ${error.message}`)`` na `throw serviceError("<op>", error)` z tą samą nazwą operacji co dziś.

**Contract**: Nazwy operacji bez zmian (`listEventAttendance`, `listGroupChildren`, `listEventDrivers`, `listGroupEvents`, `getGroupEvent`, `listMyGroups`, `getGroupWithAdmins`, `getGroupInviteToken`, `countFinishedEvents`, `group_driver_stats`, `group_child_stats`). Sygnatury funkcji serwisów bez zmian.

#### 3. Wyjątek dla tokena

**File**: `src/lib/services/invites.ts:19`

**Intent**: `getInviteGroupName` zostaje przy obecnym `new Error` z `code` i `message`, bez `cause`; dopisać komentarz, że `details` mogłoby zawierać token zaproszenia.

**Contract**: Treść komunikatu bez zmian.

### Success Criteria:

#### Automated Verification:

- Test helpera przechodzi: `npx vitest run src/lib/service-error.test.ts`
- Wszystkie testy jednostkowe przechodzą: `npm test`
- Lint (z `check-ui-literals`) przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- W `src/lib/services/` nie ma już `error.message` w `throw`: `grep -rn 'error.message}' src/lib/services` zwraca tylko `invites.ts:19`

#### Manual Verification:

- Przy `npm run dev` i zatrzymanym kontenerze bazy (`npx supabase stop` albo `docker stop` kontenera db) strona grupy pokazuje sekcję „nie udało się wczytać”, a log zawiera `listGroupChildren failed: <code> …` oraz — jeśli workerd go serializuje — `cause`; zanotować w Progress, czy `cause` był widoczny

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Logi w catch i middleware

### Overview

Bloki `catch` logują cały obiekt błędu (G-5), a logi middleware i panelu admina dostają `error.code` (P-3).

### Changes Required:

#### 1. Bloki catch

**File**: `src/pages/api/groups/events/attendance.ts:51`, `src/pages/api/groups/events/driver.ts:85`, `src/pages/dashboard.astro:23`, `src/pages/join/[token].astro:22`

**Intent**: Logować obiekt błędu zamiast `error.message`, żeby w logu był stos i `cause`. `dashboard.astro` dostaje też prefiks operacji (`"listMyGroups failed:"`), którego dziś nie ma.

**Contract**: `console.error("<op> failed:", error)`. W `join/[token].astro` komentarz o tokenie zostaje prawdziwy, bo `getInviteGroupName` nie ma `cause`.

#### 2. Middleware i admin

**File**: `src/middleware.ts:66,76`, `src/pages/admin/groups.astro:32`

**Intent**: Dodać `error.code` do istniejących logów, w stylu tras zapisu.

**Contract**: `console.error("<op> failed:", error.code, error.message)`. Zachowanie (fallback profilu, `isAppAdmin = false`, komunikat w panelu) bez zmian.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke test przechodzi: `npm run smoke`
- W `src/` nie zostaje log z samym `message`: `grep -rn 'instanceof Error ? .*\.message' src` nic nie zwraca

#### Manual Verification:

- Przy zatrzymanej bazie `/dashboard` loguje `listMyGroups failed:` z obiektem błędu (stos, kod w treści)
- Przy zatrzymanej bazie wejście na stronę zalogowanego użytkownika loguje `profile lookup failed: <code> <message>`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `serviceError`: kod + treść, pusty kod, `cause` jako ta sama referencja.

### Integration Tests:

- Brak nowych; pgTAP i smoke bez zmian zachowania.

### Manual Testing Steps:

1. `npx supabase start`, `npm run dev`, zalogować się.
2. Zatrzymać kontener bazy, odświeżyć stronę grupy i `/dashboard`.
3. Sprawdzić w terminalu, że linie logu mają kod i obiekt błędu; zanotować, czy widać `cause`.

## Performance Considerations

Brak — tylko budowa obiektu błędu na ścieżce błędu.

## Migration Notes

Brak migracji. Zmiana treści komunikatów może wymagać aktualizacji ewentualnych wyszukiwań w Workers Logs po `failed:` — prefiks zostaje ten sam.

## References

- Audyt: `context/audits/observability/2026-11-19_groups.md` (G-4, G-5, P-3)
- Plan poprawek: `context/audits/observability/2026-11-19_groups-fix-plan.md` (krok 3)
- Wzorzec helpera: `src/lib/refusal-log.ts`, `src/lib/refusal-log.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Helper i serwisy

#### Automated

- [x] 1.1 Test helpera przechodzi: `npx vitest run src/lib/service-error.test.ts` — ecafe07
- [x] 1.2 Wszystkie testy jednostkowe przechodzą: `npm test` — ecafe07
- [x] 1.3 Lint (z `check-ui-literals`) przechodzi: `npm run lint` — ecafe07
- [x] 1.4 Typy przechodzą: `npx astro check` — ecafe07
- [x] 1.5 W `src/lib/services/` nie ma już `error.message` w `throw`: `grep -rn 'error.message}' src/lib/services` zwraca tylko `invites.ts:19` — ecafe07

#### Manual

- [x] 1.6 Przy zatrzymanej bazie log strony grupy zawiera `listGroupChildren failed: <code> …`; zanotowane, czy `cause` był widoczny — ecafe07 (cause widoczny w logu dev przy console.error(err); na produkcji niesprawdzone)

### Phase 2: Logi w catch i middleware

#### Automated

- [x] 2.1 Wszystkie testy jednostkowe przechodzą: `npm test` — 2af0610
- [x] 2.2 Lint przechodzi: `npm run lint` — 2af0610
- [x] 2.3 Typy przechodzą: `npx astro check` — 2af0610
- [x] 2.4 Build przechodzi: `npm run build` — 2af0610
- [x] 2.5 Smoke test przechodzi: `npm run smoke` — 2af0610
- [x] 2.6 W `src/` nie zostaje log z samym `message`: `grep -rn 'instanceof Error ? .*\.message' src` nic nie zwraca — 2af0610

#### Manual

- [x] 2.7 Przy zatrzymanej bazie `/dashboard` loguje `listMyGroups failed:` z obiektem błędu — 2af0610
- [x] 2.8 Przy zatrzymanej bazie log zawiera `profile lookup failed: <code> <message>` — 2af0610
