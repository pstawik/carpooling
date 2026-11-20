# Strukturalne logi błędów — plan implementacji

## Overview

Krok 4 planu poprawek observability (G-6, G-3, G-7). Każdy log błędu w `src/` ma się stać jednym
obiektem z polem `event` o stałej wartości. Obiekt zawiera whitelistowane pola błędu i UUID
encji. Dzięki temu jedno zapytanie albo alert w Workers Logs po `event` pokryje wszystkie zapisy,
zdegradowane sekcje, odczyty, odmowy i błędy Auth. Odpowiedzi HTTP się nie zmieniają.

## Current State Analysis

Opis na podstawie `context/changes/structured-error-logs/research.md`.

- W `src/` poza testami jest 28 linii logowania: 27 `console.error` i 1 `console.warn`. Do tego
  dochodzi `console[level]` w `src/lib/refusal-log.ts:46`. Mapa miejsc to tabela A w research.
- Formy logów:
  - pozycyjna `"<op> failed:", code, message`, m.in. w trasach `api/**` i `middleware.ts:66,76`;
  - cały obiekt błędu, np. `dashboard.astro:23` i `console.error(loadError)` na stronach grup;
  - prefiks plus obiekt: `refusal-log.ts:46` i `middleware.ts:41,44`.

  Żadna z nich nie jest pojedynczym obiektem, a tylko taki Cloudflare dokumentuje jako
  indeksowany (research §B).
- Żadna linia, poza logami odmów, nie zawiera groupId, eventId ani userId (audyt G-6).
- Konflikt PII (F3): `serviceError` trzyma cały błąd PostgREST w `cause`
  (`src/lib/service-error.ts:8`). `console.error(err)` w 7 miejscach wypisuje więc `details` i
  `hint`. Te miejsca to `attendance.ts:51`, `driver.ts:85`, `dashboard.astro:23` i 4 `catch`
  na stronach grup.
- `joinByInvite` (`src/lib/services/invites.ts:26-45`) loguje w serwisie, ale nie zna id
  użytkownika.

## Desired End State

- `src/lib/error-log.ts` udostępnia czysty builder `errorLogFields` i wrapper `logError`. Wrapper
  jest jedynym miejscem w `src/` (poza testami), które woła `console`.
- Każdy log błędu to `console.<level>(obiekt)` z polami:
  - `event` (jedna z 5 wartości), `op`, `name`, `code` i `message` (wyłącznie te trzy pola błędu);
  - id encji obecne w zasięgu;
  - opcjonalnie `failure` lub pola Auth (`kind`, `status`, `path`).
- Gałąź `unknown` w trasach zapisu dalej zwraca 302 `?error=unknown` (§6.4 test-plan), tylko z
  logiem `event: "write_failed"`.
- Po deployu w Query Builderze Workers Logs filtr po `event` zwraca wpisy z osobnymi polami.

Weryfikacja: test Vitest whitelisty i `grep -rn "console\." src` (wynik jak w kryteriach fazy 3),
lint, `astro check`, build, smoke, a na końcu ręczne zapytanie w produkcji.

### Key Discoveries:

- Wzorzec do uogólnienia to `refusalLogFields` + `logUnexpectedRefusal` (`src/lib/refusal-log.ts:15-47`).
  Jego test (`src/lib/refusal-log.test.ts`) zostaje bez zmian i ma przechodzić, bo jest wyrocznią
  kompatybilności.
- `authErrorLogFields` (`src/lib/auth-error.ts:36-46`) już whitelistuje `name`, `status`, `code`,
  `message` i `path`. Środowisko Auth zachowuje ten kształt i dodaje `event` i `kind`.
- `eslint.config.js:25` ustawia `no-console: "warn"`. Każde miejsce ma dziś
  `eslint-disable-next-line`. Po zmianie zostaje jedno wyłączenie w `error-log.ts`.
- `signInWithPassword` (`src/pages/api/auth/signin.ts:34`) i `signUp` (`signup.ts:36`) zwracają
  `data.user`. Tam trzeba wziąć `userId` dla `joinByInvite`, bo `locals.user` jest wtedy jeszcze
  puste.
- `test-plan.md:234-239` (§6.4) opisuje gałąź `unknown` jako „`console.error` + 302”. Tekst trzeba
  zaktualizować na nowy helper, bez zmiany kontraktu odpowiedzi.

## What We're NOT Doing

- Nie zmieniamy statusu gałęzi `unknown` (zostaje 302, PRG). To decyzja tego planu.
- Nie logujemy `details`, `hint` ani stacka, także z `cause`. Diagnozę zapewnia sam `code`.
- Nie dodajemy `catch` wokół wywołań, które dziś kończą się 500 bez logu aplikacji
  (`getGroupWithAdmins` i `getGroupEvent` na stronach, `getGroupInviteToken`). Decyzja F6 w
  `2026-11-13-child-attendance-declaration` dopuszcza 500 dla głównego zapytania.
- Nie dodajemy endpointu testowego do emisji logów ani testów `console` (test-plan dopuszcza tylko
  czyste funkcje).
- Nie konfigurujemy alertów ani Issues w Cloudflare. Weryfikacja tylko sprawdza, czy pola da się
  filtrować.
- Nie ruszamy P-2 ani G-8 (krok 5, `observability-followups`).

## Implementation Approach

Najpierw powstaje helper z testem. `logUnexpectedRefusal` przechodzi na niego, a jego test chroni
dotychczasowy kształt pól. Potem mechanicznie podpinamy trasy zapisu (jeden kształt danych:
`outcome.error` lub surowy błąd PostgREST), a na końcu odczyty, strony i middleware (błędy z
`cause`, Auth). Każda faza to osobny commit z zielonym lintem, testami i buildem.

## Critical Implementation Details

- **Źródło `code` i `message`:** gdy błąd ma obiekt w `cause` (błąd z `serviceError`), builder
  bierze `code` i `message` z `cause`, a `name` z samego błędu. Dzięki temu znika podwójny prefiks
  `listMyGroups failed: … listMyGroups failed:` z F1. Bez `cause` pola pochodzą z samego błędu.
  Wartości niebędące stringami pomijamy (jak `readString` w `refusal-log.ts:15-19`). Brak `code`
  daje brak pola, a nie literał `undefined` (F2).
- **Token zaproszenia:** w `joinByInvite`, `invite.ts` i `join/[token].astro` do kontekstu logu nie
  trafia żaden token. `getInviteGroupName` zostaje bez `cause` (`invites.ts:20`).

## Faza 1: Helper i odmowy

### Overview

Wspólny builder pól logu z testem whitelisty. `logUnexpectedRefusal` emituje pojedynczy obiekt.

### Changes Required:

#### 1. Helper logu błędu

**File**: `src/lib/error-log.ts` (nowy)

**Intent**: Jedna czysta funkcja buduje PII-free pola logu dla każdej kategorii, a cienki wrapper
wypisuje je jako jedyny argument `console`, żeby Workers Logs indeksowało pola.

**Contract**:

```ts
export type ErrorLogEvent =
  | "write_failed" | "section_degraded" | "read_failed" | "unexpected_refusal" | "auth_failed";
export interface ErrorLogContext {
  userId?: string; groupId?: string; eventId?: string; childId?: string;
  failure?: string; // kod porażki z outcome (np. generate.ts), nigdy dane użytkownika
}
export interface ErrorLogFields extends ErrorLogContext {
  event: ErrorLogEvent; op: string; name?: string; code?: string; message?: string;
}
export function errorLogFields(event: ErrorLogEvent, op: string, error: unknown, context: ErrorLogContext): ErrorLogFields;
export function emitLog(level: "warn" | "error", fields: object): void; // jedyne console[level](fields) w src/
export function logError(level: "warn" | "error", event: ErrorLogEvent, op: string, error: unknown, context: ErrorLogContext): void;
```

Z `context` builder kopiuje tylko klucze zdefiniowane w `ErrorLogContext` i pomija te równe
`undefined`.

#### 2. Test helpera

**File**: `src/lib/error-log.test.ts` (nowy)

**Intent**: Pilnuje whitelisty i reguły `cause`. Oczekiwane obiekty są zapisane literalnie
(wyrocznia z §6.4).

**Contract**: przypadki testowe:
- błąd PostgREST z `details`, `hint` i `token` daje tylko `code` i `message`;
- `Error` z `cause` bierze `code` i `message` z `cause`, a `name` z błędu;
- `Error` bez `cause` bierze `name` i `message` z błędu;
- `null`, string i liczba nie dają żadnych pól błędu;
- pola niebędące stringami są pomijane;
- pusty kod nie tworzy pola;
- dodatkowe klucze w `context` (np. `email`) nie są kopiowane;
- `undefined` w id nie tworzy klucza.

#### 3. Odmowy na nowym helperze

**File**: `src/lib/refusal-log.ts`

**Intent**: `refusalLogFields` deleguje do `errorLogFields("unexpected_refusal", …)`, a
`logUnexpectedRefusal` emituje pojedynczy obiekt przez `emitLog`, bez prefiksu
`"unexpected refusal:"`.

**Contract**: sygnatury `refusalLogFields` i `logUnexpectedRefusal` się nie zmieniają, więc 13
miejsc wywołań zostaje bez zmian. `src/lib/refusal-log.test.ts` przechodzi bez edycji.

### Success Criteria:

#### Automated Verification:

- Test helpera przechodzi: `npx vitest run src/lib/error-log.test.ts`
- Test odmów przechodzi bez zmian w pliku testu: `npx vitest run src/lib/refusal-log.test.ts`
- Wszystkie testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`

#### Manual Verification:

- W `npm run dev` POST deklaracji z cudzym `groupId` wypisuje w terminalu jeden obiekt z
  `event: "unexpected_refusal"`, bez prefiksu tekstowego
  - Uwaga z implementacji: odmowę wywołuje podmiana ukrytego pola `event_id`, nie `group_id`.
    `set_child_attendance` nie przyjmuje `group_id`, które służy tylko do budowy URL powrotu.

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne
potwierdzenie przed kolejną fazą.

---

## Faza 2: Trasy zapisu

### Overview

Wszystkie 15 miejsc `write_failed` przechodzi na `logError("error", "write_failed", …)` z id
encji. `joinByInvite` dostaje `userId`.

### Changes Required:

#### 1. Trasy grup

**File**: `src/pages/api/groups/children.ts`, `children/update.ts`, `children/delete.ts`,
`events.ts`, `events/update.ts`, `events/delete.ts`, `events/generate.ts`, `events/attendance.ts`
(linia 63), `events/driver.ts` (linie 61 i 72), `invite.ts`

**Intent**: W gałęzi `unknown` zastąpić pozycyjny `console.error` wywołaniem `logError` z
`outcome.error` (albo surowym błędem RPC w `invite.ts`). Do kontekstu trafiają `userId`, `groupId`
i, jeśli są w zasięgu, `eventId` i `childId` (research, tabela A, wiersze 10–22). Redirect 302
zostaje bez zmian.

**Contract**:
- `op` to dotychczasowa nazwa z prefiksu (`addChild`, `setChildAttendance`,
  `regenerate_group_invite`, …);
- `generate.ts` przekazuje `failure: outcome.failure`;
- w `attendance.ts` można użyć istniejącego `refusalIds` jako kontekstu;
- `invite.ts` nie przekazuje tokenu.

#### 2. Trasy admina

**File**: `src/pages/api/admin/groups.ts`, `src/pages/api/admin/groups/admins.ts`

**Intent**: To samo dla `create_group` i `add_group_admin`.

**Contract**:
- `groups.ts` przekazuje tylko `userId`;
- `admins.ts` przekazuje `userId` i `groupId: result.data.group_id`;
- e-maili (`admin_emails`, `email`) nie logujemy.

#### 3. Dołączanie z zaproszenia

**File**: `src/lib/services/invites.ts`, `src/pages/api/groups/join.ts`,
`src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`

**Intent**: `joinByInvite` przyjmuje `userId` i loguje oba przypadki przez `logError`: błąd RPC
oraz brak wiersza. Wywołujący przekazują `userId`. W signin i signup id pochodzi z `data.user`
zwróconego przez Auth.

**Contract**:
- nowa sygnatura: `joinByInvite(supabase, token, userId: string)`;
- `op: "join_group_by_invite"` dla obu przypadków;
- brak wiersza loguje błąd `null` z `failure: "no_row"`;
- token nigdy nie trafia do logu.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi bez zmian w skrypcie: `npm run smoke`
- W `src/pages/api` nie zostaje `console.`: `grep -rn "console\." src/pages/api` nic nie zwraca

#### Manual Verification:

- Przy zatrzymanej bazie (`npx supabase stop` po zalogowaniu) zapis dziecka daje 302 z banerem
  „Coś poszło nie tak”, a w terminalu jest jeden obiekt z `event: "write_failed"`,
  `op: "addChild"`, `userId` i `groupId`

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne
potwierdzenie przed kolejną fazą.

---

## Faza 3: Odczyty, strony i middleware

### Overview

Pozostałe miejsca przechodzą na nowe kategorie: 7 `section_degraded`, 4 `read_failed` i 2
`auth_failed`. Dokumentacja dostaje aktualizację, a format jest weryfikowany w produkcji.

### Changes Required:

#### 1. Zdegradowane sekcje na stronach

**File**: `src/pages/dashboard.astro`, `src/pages/groups/[id].astro` (linie 77 i 91),
`src/pages/groups/[id]/terminy/[eventId].astro`, `src/pages/groups/[id]/statystyki.astro`,
`src/pages/admin/groups.astro`

**Intent**: `catch` z `console.error(err)` zamienić na
`logError("error", "section_degraded", <sekcja>, err, { userId, groupId, eventId? })`. W panelu
admina tak samo dla błędu RPC listy.

**Contract**:
- `op` to nazwa sekcji: `myGroups`, `groupEvents`, `groupChildren`, `eventPlan`, `groupStats`,
  `adminGroups`;
- która usługa zawiodła, widać w `message` (nazwa operacji z `serviceError` zostaje w `cause`, a
  `code` pochodzi z `cause`).

#### 2. Odczyty w trasach i na stronie zaproszenia

**File**: `src/pages/api/groups/events/attendance.ts` (linia 51),
`src/pages/api/groups/events/driver.ts` (linia 85), `src/pages/join/[token].astro`

**Intent**: Błąd `getGroupEvent` po odmowie zapisu oraz błąd sprawdzenia zaproszenia są logowane
jako `read_failed`. Redirect i status 503 strony zaproszenia się nie zmieniają.

**Contract**:
- `op: "getGroupEvent"` i `op: "getInviteGroupName"`;
- na stronie zaproszenia kontekst to tylko `userId`, jeśli użytkownik jest zalogowany; bez tokenu.

#### 3. Middleware

**Files**: `src/middleware.ts`, `src/lib/auth-error.ts`, `src/lib/auth-error.test.ts`

**Intent**: Błędy Auth emitujemy jako jeden obiekt `auth_failed`. Zachowuje on dotychczasowe
whitelistowane pola i dodaje `kind`: `session_rejected` daje `warn`, `outage` daje `error`. Błąd
profilu staje się `section_degraded` (op `profile`), a `is_app_admin` staje się `read_failed`. W
obu przypadkach kontekstem jest `userId: user.id`.

**Contract**:
- `auth-error.ts` dostaje czystą funkcję `authFailedLogFields(kind, error, pathname)`, zwracającą
  `{ event: "auth_failed", op: "getUser", kind, ...authErrorLogFields(error, pathname) }`;
- middleware emituje ją przez `emitLog`;
- test w `auth-error.test.ts` sprawdza pola `event` i `kind` oraz to, że nie pojawia się żaden
  dodatkowy klucz.

#### 4. Dokumentacja

**File**: `context/foundation/test-plan.md` (§6.4, linie 234-239)

**Intent**: Kontrakt odpowiedzi mówi teraz: nieznany błąd bazy daje
`logError("error", "write_failed", …)` i 302 `?error=unknown`, nigdy 500. Zmienia się tylko nazwa
mechanizmu logu, nie odpowiedź.

**Contract**: jedno zdanie w §6.4. Bez zmian w kolejności i nazwach sekcji.

**File**: `context/audits/observability/2026-11-19_groups-fix-plan.md` (tabela, wiersz kroku 4)

**Intent**: Po merge PR status kroku 4 zmienia się na „zakończona (#<PR>)”.

**Contract**: tylko komórka Status.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi: `npm run smoke`
- Jedynym `console.` w `src/` poza testami jest `src/lib/error-log.ts`:
  `grep -rln "console\." src --include=*.ts --include=*.astro --include=*.tsx | grep -v "\.test\."`
  zwraca tylko ten plik

#### Manual Verification:

- Przy zatrzymanej bazie strona grupy pokazuje „Nie udało się wczytać…”, a terminal pokazuje obiekt
  z `event: "section_degraded"`, `code` z `cause` i bez `details`/`hint`
- Po deployu POST z obcym `groupId` na produkcji, a w Query Builderze Workers Logs filtr
  `event = unexpected_refusal` zwraca wpis z osobnymi polami `op`, `code` i `userId`. Do Progress
  trzeba zanotować nazwę pola poziomu i to, czy wpis widać w Issues
  - Uwaga z implementacji fazy 1: odmowę wywołuje obcy `event_id` w formularzu deklaracji (patrz
    kryterium 1.6), nie `groupId`.

**Implementation Note**: Kryterium produkcyjne zamyka się po merge i deployu. Wynik trzeba
zanotować w Progress i w issue.

---

## Testing Strategy

### Unit Tests:

- `src/lib/error-log.test.ts`:
  - whitelist pól błędu;
  - reguła `cause` (kod z `cause`, nazwa z błędu);
  - wartości nie-stringowe i puste;
  - filtrowanie kontekstu do znanych kluczy;
  - wszystkie 5 wartości `event` przyjmowane przez typ.
- `src/lib/refusal-log.test.ts` bez zmian, jako dowód kompatybilności.
- `src/lib/auth-error.test.ts`: nowy przypadek `authFailedLogFields`.

### Integration Tests:

- Smoke (`npm run smoke`) bez zmian: statusy i przekierowania zostają takie same. Gałęzi
  `unknown` smoke nie wywołuje (`test-plan.md:252-254`).

### Manual Testing Steps:

1. `npm run dev`, zalogować się, zatrzymać bazę, zapisać dziecko. Oczekiwane: 302, baner i obiekt
   `write_failed` w terminalu.
2. Przy zatrzymanej bazie otworzyć stronę grupy. Oczekiwane: tekst „Nie udało się wczytać…” i
   obiekt `section_degraded` bez `details`.
3. POST deklaracji z obcym `event_id` (ukryte pole formularza). Oczekiwane: 404 i obiekt `unexpected_refusal` (warn).
4. Po deployu powtórzyć krok 3 na produkcji i przefiltrować Query Builder po `event`.

## Performance Considerations

Brak. Builder kopiuje kilka pól, a wywołania zdarzają się tylko na ścieżkach błędów.

## Migration Notes

Wyszukiwania pełnotekstowe po `failed:` przestaną trafiać w trasy zapisu. Należy zamiast nich
filtrować po `event` i `op`. Retencja Workers Logs to 7 dni, więc stare wpisy wygasną same.

## References

- Research: `context/changes/structured-error-logs/research.md`
- Audyt: `context/audits/observability/2026-11-19_groups.md` (G-3, G-6, G-7)
- Plan poprawek: `context/audits/observability/2026-11-19_groups-fix-plan.md` (krok 4)
- Wzorzec: `src/lib/refusal-log.ts:15-47`, `src/lib/auth-error.ts:28-46`
- Uwagi F1–F3: `context/archive/2026-11-20-service-error-cause/reviews/impl-review.md:28-56`
- Kontrakt odpowiedzi: `context/foundation/test-plan.md:234-239`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Helper i odmowy

#### Automated

- [x] 1.1 Test helpera przechodzi: `npx vitest run src/lib/error-log.test.ts` — 691e8e0
- [x] 1.2 Test odmów przechodzi bez zmian w pliku testu: `npx vitest run src/lib/refusal-log.test.ts` — 691e8e0
- [x] 1.3 Wszystkie testy jednostkowe przechodzą: `npm test` — 691e8e0
- [x] 1.4 Lint przechodzi: `npm run lint` — 691e8e0
- [x] 1.5 Typy przechodzą: `npx astro check` — 691e8e0

#### Manual

- [x] 1.6 W `npm run dev` POST deklaracji z cudzym `groupId` wypisuje jeden obiekt z `event: "unexpected_refusal"`, bez prefiksu tekstowego — 691e8e0

### Phase 2: Trasy zapisu

#### Automated

- [x] 2.1 Wszystkie testy jednostkowe przechodzą: `npm test` — 0eed999
- [x] 2.2 Lint przechodzi: `npm run lint` — 0eed999
- [x] 2.3 Typy przechodzą: `npx astro check` — 0eed999
- [x] 2.4 Build przechodzi: `npm run build` — 0eed999
- [x] 2.5 Smoke przechodzi bez zmian w skrypcie: `npm run smoke` — 0eed999
- [x] 2.6 W `src/pages/api` nie zostaje `console.`: `grep -rn "console\." src/pages/api` nic nie zwraca — 0eed999

#### Manual

- [x] 2.7 Przy zatrzymanej bazie zapis dziecka daje 302 z banerem, a terminal pokazuje obiekt `write_failed` z `op: "addChild"`, `userId` i `groupId` — 0eed999

### Phase 3: Odczyty, strony i middleware

#### Automated

- [x] 3.1 Wszystkie testy jednostkowe przechodzą: `npm test` — 33dac0b
- [x] 3.2 Lint przechodzi: `npm run lint` — 33dac0b
- [x] 3.3 Typy przechodzą: `npx astro check` — 33dac0b
- [x] 3.4 Build przechodzi: `npm run build` — 33dac0b
- [x] 3.5 Smoke przechodzi: `npm run smoke` — 33dac0b
- [x] 3.6 Jedynym `console.` w `src/` poza testami jest `src/lib/error-log.ts` — 33dac0b

#### Manual

- [x] 3.7 Przy zatrzymanej bazie strona grupy pokazuje „Nie udało się wczytać…”, a terminal obiekt `section_degraded` z `code` z `cause`, bez `details`/`hint` — 33dac0b
- [x] 3.8 Po deployu filtr `event = unexpected_refusal` w Query Builderze zwraca wpis z osobnymi polami; zanotowane pole poziomu i widoczność w Issues — 4f05b91
  - Wynik (2026-11-20, produkcja po merge #88): filtr zwraca wpis z osobnymi polami `op`, `code`, `userId`; poziom `warn`. Nazwy pola poziomu ani widoczności w Issues nie zanotowano.
