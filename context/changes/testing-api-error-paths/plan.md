# Ścieżki błędów i walidacja wejścia w API — plan implementacji

## Overview

Faza 4 planu testów (`context/foundation/test-plan.md:72`, ryzyko #5). Celem jest udowodnienie, że
błąd backendu i złośliwe lub brzegowe wejście kończą się jawnym błędem, a nie 500 ani pozornym
sukcesem. Odmowa uprawnień (42501) daje 404. Błąd pola wpisanego przez użytkownika daje 302 z
dokładnym kodem z białej listy. Nieznany błąd bazy daje `?error=unknown`. Research znalazł żywy
błąd: oba endpointy admina zwracają 500 zamiast 404. Faza zaczyna od niego (test czerwony,
poprawka, test zielony), potem dokłada najtańsze testy jednostkowe i smoke na ścieżkach błędu
handlerów.

## Current State Analysis

- `POST /api/admin/groups` i `/api/admin/groups/admins` czytają oryginalne ciało
  (`src/pages/api/admin/groups.ts:10`, `admins.ts:10`) i wołają `rewrite("/404")` przy 42501
  (`:33`). Astro 7.4.4 rzuca wtedy `RewriteWithBodyUsed`
  (`node_modules/astro/dist/core/routing/rewrite.js:123-126`). Sonda 2026-11-19 (anonim) dała
  `500` na obu ścieżkach (research §B). Pozostałe 13 endpointów `groups/**` czyta
  `request.clone().formData()`.
- Czyste mappery błędów i schematy zod nie mają testów. W `src/**/*.test.ts` jest 5 plików i
  żaden ich nie importuje (research §C).
- `writeResult` w `src/lib/services/children.ts:25-33` i `src/lib/services/events.ts:30-38` są
  prywatne. Mapowanie kodów w `setChildAttendance` (`attendance.ts:59-64`) i `setEventDriver`
  (`drivers.ts:64-69`) jest wplecione w funkcje, które biorą klienta Supabase.
- Poprawki z archiwum bez testu regresji: lata 9999/0999/0000, data serii `99999-0x1-01`,
  ciało nie-formularzowe (research §D).
- Smoke (`scripts/smoke.mjs`) porównuje `location` prefiksem (`:657`). Wylogowanie asertuje
  prefiks `/`, logowanie i rejestracja `/dashboard`, a kroki `:221` i `:239` samo `?error=`.
  `request()` (`:24-38`) umie wysłać tylko formularz urlencoded.
- Z 12 endpointów z `rewrite("/404")` brak kroku 404 w smoke dla 7: `admin/groups`,
  `admin/groups/admins`, `groups/invite`, `groups/children/update`, `groups/children/delete`,
  `groups/events/update`, `groups/events/delete`.

## Desired End State

- Zwykły zalogowany użytkownik i anonim dostają 404 z obu endpointów admina, a grupa próbna nie
  powstaje. Smoke to sprawdza, a krok był czerwony przed poprawką.
- Vitest przypina mapowanie każdego znanego kodu błędu na kod HTTP lub redirect, mapowanie
  nieznanego kodu na `unknown` i granice wejścia z findingów archiwum. Wyrocznie pochodzą z
  ograniczeń `check` w migracjach, decyzji z archiwum i kontraktu „404 = brak prawa”, nigdy z
  kodu pod testem.
- Każdy endpoint z `rewrite("/404")` ma w smoke krok na swojej ścieżce 404. Każda z 4 rodzin
  endpointów (auth, admin, groups/**, join) ma krok z ciałem nie-formularzowym. Asercje
  przekierowań przy logowaniu, rejestracji, wylogowaniu i w krokach `:221`/`:239` są dokładne.
- §6.4 planu testów opisuje wzorzec, a §6.5 zawiera notatkę fazy 4.

Weryfikacja: `npm run lint`, `npx astro check`, `npm test`, `npm run build`,
`npx supabase test db`, `npm run smoke` (jak w CI, `.github/workflows/ci.yml`).

### Key Discoveries:

- `create_group` i `add_group_admin` sprawdzają `is_app_admin()` przed czymkolwiek innym i
  rzucają 42501 (`supabase/migrations/20261110120000_create_groups.sql:154-155,209-210`). Krok
  F9 dla `/admins` dostanie 42501 nawet z losowym `group_id`.
- `/api/admin` nie jest w `PROTECTED_ROUTES` (`src/middleware.ts:5`), więc anonim dochodzi do
  RPC i po poprawce też dostaje 404 z tej samej gałęzi.
- Wyrocznie granic pól (ograniczenia `check` w bazie): imię 1–50, nick 1–30
  (`20261109120000_create_profiles.sql:7,9`), nazwa grupy 1–80 (`20261110120000_create_groups.sql:19`),
  imię dziecka 1–40 (`20261112140000_create_children.sql:18`), notatka ≤ 200
  (`20261112150000_create_events.sql:23`), miejsca 1–8 (`20261113130000_create_event_drivers.sql:31`).
- Wyrocznie granic dat z archiwum: `9999-12-31 23:00` → poprawna chwila, `0999-…`/`0000-…` →
  `null` (`context/archive/2026-11-12-group-admin-manages-events/reviews/impl-review.md:36`).
  Atak `date_to = "99999-0x1-01"` → 0 dat w ~0 ms
  (`context/archive/2026-11-13-weekly-event-generator/reviews/impl-review.md:40`).
- Schematy wydarzeń używają `Date.now()` (`src/lib/validation/events.ts:34`), więc testy
  „w przyszłości” potrzebują `vi.useFakeTimers()` i `vi.setSystemTime`.
- Kroki smoke dzielą sesję w jednym słoiku cookie i idą po kolei. Zwykły użytkownik jest
  zalogowany w krokach `:243-248`, anonim po `:249`, admin aplikacji od `:252`.

## What We're NOT Doing

- Reguły lint/grep pilnującej `clone()` przed `rewrite`. To bramka fazy 5 planu testów; tu
  strażnikiem są kroki 404 w smoke.
- Obsługi 500 stron przy błędzie głównego zapytania (`getGroupWithAdmins`, `getGroupEvent`,
  `getGroupInviteToken`). Decyzja ACCEPTED z
  `context/archive/2026-11-13-child-attendance-declaration/reviews/impl-review.md:93` nadal
  obowiązuje, a smoke i tak nie potrafi wywołać awarii bazy.
- Komunikatu o nieudanym dołączeniu na `/join/<token>`. To decyzja produktowa (research, Open
  Question 3). Testy przypinają tylko obecny cel przekierowania.
- Gałęzi `join.ts:27-28` (`/dashboard` przy nieskonfigurowanym kliencie), która jest praktycznie
  nieosiągalna (research §F).
- Weryfikacji stanu bazy w smoke kluczem service-role. Stan sprawdza się przez renderowaną stronę.
- Pełnej macierzy ciała nie-formularzowego dla 15 endpointów (decyzja: jeden krok na rodzinę).
- Zmian w `context/archive/`. F9 jest realizowany tutaj, a plik follow-up zostaje nietknięty.

## Implementation Approach

Kolejność według koszt × sygnał. Faza 1 zamyka żywy defekt i jest jedynym miejscem, gdzie test
wyprzedza poprawkę kodu produkcyjnego: krok smoke musi być najpierw czerwony z 500, nie
„dopasowany” do obecnego zachowania. Fazy 2–3 to najtańsza warstwa (Vitest na czystych
funkcjach) i pokrywają gałąź `unknown`, nieosiągalną ze smoke. Faza 3 zmienia kod produkcyjny
tylko przez eksport albo wydzielenie czystej funkcji, bez zmiany zachowania. Faza 4 dokłada
strażników na poziomie handlera tam, gdzie czysta funkcja nie sięga (czytanie ciała, `rewrite`,
statusy HTTP). Faza 5 to weryfikacja jak w CI i cookbook.

Reguła dla wszystkich faz: czerwony test to sygnał. Zmieniony selektor lub tekst aktualizujemy w
przejrzanym diffie. Zmienione zachowanie biznesowe oznacza błąd do zgłoszenia, a asercji nie
edytujemy pod obecny kod.

## Critical Implementation Details

- **Kolejność w fazie 1:** dopisz kroki smoke, uruchom `npm run smoke` przeciw działającemu
  serwerowi i zobacz `FAIL … -> 500` dla obu endpointów admina. Dopiero potem zmień
  `formData()` na `clone().formData()`. Zapisz wynik czerwonego biegu w notatce commita lub w PR.
- **Ciało nie-formularzowe:** pusty `POST` z `Content-Type: application/x-www-form-urlencoded`
  parsuje się jako pusty formularz i **nie** trafia do `catch`. Gałąź `catch` sprawdza JSON z
  `Content-Type: application/json` albo puste ciało bez nagłówka `Content-Type`. Implementer
  potwierdza w biegu, że krok trafia w `catch` (np. brak kodu z walidacji pól w odpowiedzi).

## Faza 1: F9 — 404 zamiast 500 w endpointach admina

### Overview

Kroki smoke dla odmowy uprawnień w obu endpointach admina, najpierw czerwone z 500, potem
poprawka `clone()` w 2 plikach.

**Zachowanie asertowane:** zalogowany nie-admin i anonim wysyłają poprawny formularz do
`/api/admin/groups` i `/api/admin/groups/admins` i dostają status 404. Grupa próbna nie pojawia
się na `/admin/groups` admina aplikacji.
**Łapana regresja:** obecne 500 (`RewriteWithBodyUsed`) oraz każda przyszła zmiana, która
pozwoli nie-adminowi utworzyć grupę albo zwróci sukces.
**Źródło:** research §B; `context/archive/2026-11-10-app-admin-creates-group/follow-ups/review-fixes.md:10`.
**Przypadek brzegowy:** anonim (`/api/admin` poza `PROTECTED_ROUTES`) i losowy `group_id` w
`/admins` (42501 wyprzedza `group_not_found`).
**Unikany antywzorzec:** asercja samego statusu bez stanu danych (dlatego krok `notContains` u
admina); formularz, który odpada na zod (`invalid_input`) i nigdy nie dociera do RPC.

### Changes Required:

#### 1. Kroki smoke F9

**File**: `scripts/smoke.mjs`

**Intent**: Dodać kroki 404 dla nie-admina i anonima oraz kontrolę, że grupa próbna nie powstała.

**Contract**:
- Po kroku „regular user gets 404 on admin groups” (`:248`), wciąż jako zwykły użytkownik:
  - POST `/api/admin/groups` z `name` = nowa unikalna nazwa próbna (np.
    `Smoke probe ${Date.now()}`) i `admin_emails` = `email` smoke-usera → `{ status: 404 }`;
  - POST `/api/admin/groups/admins` z `group_id` = `randomUUID()` i `email` = `email` → `{ status: 404 }`.
- Po wylogowaniu (`:249`), anonimowo: POST `/api/admin/groups` z tym samym poprawnym
  formularzem → `{ status: 404 }`.
- Po kroku „admin groups page lists the new group” (`:271`): GET `/admin/groups` jako admin →
  `{ status: 200, notContains: <nazwa próbna> }`.

#### 2. Poprawka endpointów admina (po czerwonym biegu)

**File**: `src/pages/api/admin/groups.ts`, `src/pages/api/admin/groups/admins.ts`

**Intent**: Czytać klon żądania, żeby `rewrite("/404")` działał po parsowaniu ciała, jak w
pozostałych endpointach.

**Contract**: `context.request.formData()` → `context.request.clone().formData()`, z tym samym
komentarzem co w `src/pages/api/groups/invite.ts:15-16`. Reszta bez zmian (`invalid_input` w
`catch` zostaje).

### Success Criteria:

#### Automated Verification:

- Przed poprawką `npm run smoke` raportuje FAIL z 500 dla obu nowych kroków nie-admina i dla kroku anonima
- Po poprawce `npm run smoke` przechodzi w całości
- `npm run lint`, `npx astro check`, `npm test` przechodzą

#### Manual Verification:

- Wynik czerwonego biegu (nazwy kroków + `-> 500`) jest zapisany w opisie commita lub PR

**Implementation Note**: Po fazie i automatycznej weryfikacji zatrzymaj się na potwierdzenie
ręcznej części przed fazą 2.

---

## Faza 2: Vitest — czyste mappery i schematy

### Overview

Testy jednostkowe istniejących, eksportowanych czystych funkcji i schematów zod, bez zmian w
kodzie produkcyjnym.

**Zachowanie asertowane:** każdy znany kod błędu Postgresa/GoTrue/zod mapuje się na
właściwy kod z białej listy albo na `forbidden`. Każdy nieznany kod mapuje się na `unknown`.
Spreparowany parametr nie trafia do komunikatu. Wejście na granicy (długości, miejsca, lata,
seria) daje błąd pola z właściwym kodem, a nie wyjątek.
**Łapana regresja:** nowy lub zmieniony kod błędu, który spada na sukces albo na surowy
komunikat; powrót RangeError dla lat (group-admin-manages-events F1); powrót pętli CPU dla
zniekształconej daty serii (weekly-event-generator F1); błąd pola, który zamiast przekierowania z
kodem daje 404, lub odwrotnie.
**Źródło:** research §C, §D; wyrocznie z „Key Discoveries”.
**Przypadek brzegowy:** wartości dokładnie na granicy i o 1 za nią; `P0001` z komunikatem spoza
listy; `unknown_email` z parametrem, który nie jest e-mailem; rok 9999 vs 0999/0000.
**Unikany antywzorzec:** oczekiwana wartość przepisana z kodu pod testem (np. kopiowanie
`RPC_ERROR_KEYS`); mockowanie klienta Supabase (testy biorą tylko obiekty błędów
`{ code, message, details }`).

### Changes Required:

#### 1. Mappery błędów grup i auth

**File**: `src/lib/services/group-errors.test.ts`, `src/lib/services/auth-errors.test.ts` (nowe)

**Intent**: Przypiąć tłumaczenie błędów RPC/GoTrue/zod na kody i komunikaty.

**Contract**:
- `groupRpcFailure`: 42501 → `forbidden`; P0001 + każdy z `unknown_email`, `group_not_found`,
  `no_admins`, `invalid_invite` → ten kod (lista wypisana dosłownie w teście, z cytatem migracji
  RPC w opisie); `unknown_email` z `details` → `email`, z pustym `details` → bez `email`; P0001 +
  `insufficient_privilege` lub dowolny inny komunikat → `unknown`; kod spoza listy (np. `08006`,
  `PGRST301`, `23505`) → `unknown`.
- `createGroupIssueCode` / `addGroupAdminIssueCode` na issues z rzeczywistego `safeParse` (nie
  ręcznie budowanych): pusta lub 81-znakowa nazwa → `invalid_name`, 11 e-maili → `invalid_emails`,
  zły `group_id` → `group_not_found`.
- `adminGroupsErrorUrl`: `email` tylko przy `unknown_email`; znak specjalny w e-mailu jest
  zakodowany w URL; dla innego kodu `email` pominięty.
- `groupErrorMessage` / `authErrorMessage`: `null` → `null`; nieznany kod → tekst ogólny;
  `unknown_email` z `x<script>` → tekst bez parametru, z poprawnym e-mailem → tekst z adresem.
- `groupNoticeMessage` / `noticeMessage`: nieznany kod → `null`.
- `authErrorCode`: `user_already_exists` i `email_exists` → `email_exists`;
  `over_request_rate_limit` i `over_email_send_rate_limit` → `rate_limited`; inny lub brak kodu →
  `unknown`.
- `signUpIssueCode` na `signUpSchema.safeParse`: brak nicka → `invalid_nick`, telefon 8 cyfr →
  `invalid_phone`, imię 51 znaków → `invalid_first_name`.

#### 2. Przekierowanie po dołączeniu

**File**: `src/lib/services/invites.test.ts` (nowy)

**Intent**: Przypiąć, że porażka dołączenia nigdy nie wygląda jak sukces.

**Contract**: `joinRedirect`: `joined`/`already_member` → `/groups/<id>?message=<kind>` (dokładny
string); `invalid` i `error` → `/join/<token>` (dokładny string, bez `message`). Oracle: decyzja
join-group-by-invite-link F2 (`…/reviews/impl-review.md:78`). `optionalInviteToken`: 31/33 znaki,
`null`, znak spoza alfabetu → `null`.

#### 3. Schematy i mappery pól

**File**: `src/lib/validation/events.test.ts`, `src/lib/validation/children.test.ts`,
`src/lib/validation/drivers.test.ts` (nowe)

**Intent**: Przypiąć granice wejścia i rozróżnienie „błąd użytkownika → kod” vs
„spreparowany formularz → 404”.

**Contract**:
- `addEventSchema` (czas zamrożony `vi.setSystemTime`, np. 2026-11-19T12:00:00Z):
  `9999-12-31` `23:00` → sukces ze `startsAt` = `9999-12-31T22:00:00.000Z` (CET +1);
  `0999-06-01` i `0000-01-01` → porażka, `eventFieldError` → `invalid_event_start`; żadne
  wywołanie nie rzuca. Przy zamrożonym 12:00:00Z (13:00 w Warszawie) start `13:01` (dokładnie
  `now + 60 s`) → porażka (marża `START_MARGIN_MS`, warunek ostry `>`), `13:02` → sukces; pole
  czasu ma rozdzielczość minuty (oracle: komentarz-kontrakt marży `validation/events.ts:26-30` i
  decyzja F3 w `context/archive/2026-11-12-group-admin-manages-events/reviews/impl-review.md`). Notatka
  200 znaków → sukces, 201 → `invalid_event_note`. Zła data i za długa notatka naraz →
  `invalid_event_start` (start wygrywa).
- `eventFieldError`: zły `group_id` lub `event_id` → `null` (404).
- `generateEventsSchema`: `date_to = "99999-0x1-01"` → porażka w czasie < 100 ms (asercja czasu
  w teście), `eventSeriesFieldError` → `invalid_event_series`; zakres 366 dni → sukces, 367 →
  `invalid_event_series`; `2026-02-30` → `invalid_event_series`; zły `group_id` → `null`.
- `weeklyDates("2026-01-01", "99999-0x1-01", 1)` → `[]` (dopisane do istniejącego
  `src/lib/weekly-events.test.ts`).
- `addChildSchema` + `groupIdIfOnlyNameInvalid`: imię 40 znaków → sukces, 41 i same spacje →
  błąd z `group_id` (przekierowanie `invalid_child_name`); zły `group_id` → `null`.
- `driverSeatsSchema`: `0`, `9`, `1.5`, `abc` → porażka; `1` i `8` → sukces. `driverFormSchema`:
  `action = "delete"` → porażka.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi z nowymi plikami testów
- `npm run lint` i `npx astro check` przechodzą
- Celowe zepsucie: usunięcie `.filter(Number.isFinite)` w `src/lib/time.ts` daje czerwony test roku 9999; cofnięte
- Celowe zepsucie: usunięcie `seriesCheckOptions` z `generateEventsSchema` daje czerwony test `99999-0x1-01`; cofnięte
- Celowe zepsucie: `groupRpcFailure` zwracające `forbidden` dla każdego P0001 daje czerwony test; cofnięte

#### Manual Verification:

- Przegląd: żadna oczekiwana wartość w nowych testach nie jest wyliczana funkcją pod testem ani importowaną stałą z modułu pod testem

---

## Faza 3: Eksport mapperów zapisu i ich testy

### Overview

Udostępnić do testów mapowanie kodów błędów zapisu w czterech serwisach, bez zmiany zachowania,
i przypiąć je Vitestem.

**Zachowanie asertowane:** 42501 → `forbidden`, 23505 → `duplicate_child`/`duplicate_event`,
23503 → `not_found` (attendance), 23514 → `invalid_seats` (drivers), 0 dopasowanych wierszy →
`child_not_found`/`event_not_found`, każdy inny kod → `unknown` z zachowanym obiektem błędu.
**Łapana regresja:** nieznany błąd bazy zamieniony na sukces albo na „nie znaleziono” (pozorny
brak zamiast awarii); pusty wynik UPDATE/DELETE potraktowany jak sukces.
**Źródło:** research §C (prywatne `writeResult`, mapowanie w `attendance.ts:59-64`,
`drivers.ts:64-69`); komentarze-kontrakty RLS w tych plikach (`children.ts:20-24`,
`events.ts:24-29`).
**Przypadek brzegowy:** `rows = null` vs `rows = []` vs brak `rows` (INSERT); błąd i wiersze naraz.
**Unikany antywzorzec:** mockowanie wnętrza klienta Supabase. Testy wołają czyste funkcje
z obiektem błędu i tablicą wierszy.

### Changes Required:

#### 1. Eksport i wydzielenie mapperów

**File**: `src/lib/services/children.ts`, `src/lib/services/events.ts`,
`src/lib/services/attendance.ts`, `src/lib/services/drivers.ts`

**Intent**: Uczynić mapowanie błędów testowalnym bez klienta; zachowanie wywołujących
funkcji bez zmian.

**Contract**:
- `children.ts`: `export function childWriteResult(error, rows?)` (zmiana nazwy z `writeResult`,
  żeby nie kolidowała z eksportem z `events.ts`); wywołania w pliku zaktualizowane.
- `events.ts`: `export function eventWriteResult(error, rows?)`, analogicznie.
- `attendance.ts`: `export function attendanceWriteResult(error: PostgrestError | null): AttendanceWriteResult`,
  używane w `setChildAttendance`.
- `drivers.ts`: `export function driverWriteResult(error: PostgrestError | null): DriverWriteResult`,
  używane w `setEventDriver`.

#### 2. Testy mapperów

**File**: `src/lib/services/children.test.ts` (nowy), `src/lib/services/events.test.ts`,
`src/lib/services/attendance.test.ts`, `src/lib/services/drivers.test.ts` (istniejące, dopisane bloki)

**Intent**: Przypiąć tabelę kod → porażka z „Zachowania asertowanego”.

**Contract**: dla każdego mappera: `null` + brak `rows` → `{ ok: true }`; `null` + `[{id}]` →
`{ ok: true }`; `null` + `[]` i `null` + `null` → `*_not_found` (children/events); każdy znany kod →
jego porażka z `error` przekazanym dalej; kod spoza listy (np. `08006`) → `unknown`. Opis
asercji cytuje źródło znaczenia kodu (komentarz RLS lub ograniczenie `check` w migracji).

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi
- `npm run lint` i `npx astro check` przechodzą
- `npm run smoke` przechodzi (zachowanie endpointów bez zmian)
- Celowe zepsucie: `childWriteResult` traktujące `rows = []` jako sukces daje czerwony test; cofnięte
- Celowe zepsucie: `driverWriteResult` mapujące nieznany kod na `invalid_seats` daje czerwony test; cofnięte

---

## Faza 4: Smoke — ścieżki błędu handlerów

### Overview

Strażnicy na poziomie handlera tam, gdzie czysta funkcja nie sięga, oraz zaostrzenie istniejących
asercji przekierowań.

**Zachowanie asertowane:** każdy endpoint z `rewrite("/404")` odpowiada 404 na swojej ścieżce
odmowy lub spreparowanego id (nie 500). Ciało nie-formularzowe daje jawny błąd właściwy rodzinie.
Udane logowanie, rejestracja i wylogowanie przekierowują dokładnie tam, gdzie mają. Odrzucona
rejestracja i logowanie niosą konkretny kod.
**Łapana regresja:** dryf `clone()` w dowolnym endpoincie z `rewrite`; powrót 500 przy JSON lub
pustym ciele (signup-with-profile F6); przekierowanie z `?error=` brane za sukces; zmiana kodu
błędu przechodząca niezauważona.
**Źródło:** research §A, §E; lista 7 endpointów bez kroku 404 („Current State Analysis”).
**Przypadek brzegowy:** spreparowane id (`not-a-uuid`) jako jedyna ścieżka 404 dla
`children/update`, `children/delete`, `events/update`, `events/delete` (nie-właściciel dostaje
tam 0 wierszy → przekierowanie); członek nie-admin dla `invite` (42501).
**Unikany antywzorzec:** prefiksowe `location` dla przekierowania sukcesu; asercja `?error=` bez
kodu; ciało pustego formularza urlencoded, które omija `catch` (patrz „Critical Implementation Details”).

### Changes Required:

#### 1. Surowe ciało w helperze

**File**: `scripts/smoke.mjs`

**Intent**: Pozwolić krokom wysłać JSON albo puste ciało bez `Content-Type`.

**Contract**: `request(path, { method, form, rawBody, contentType, readBody })`: `rawBody`
(string) wysyłany dosłownie, `contentType` ustawiany tylko gdy podany; `form` działa jak dziś.
Zero nowych zależności.

#### 2. Kroki 404 dla pozostałych 5 endpointów z `rewrite`

**File**: `scripts/smoke.mjs`

**Intent**: Strażnik `RewriteWithBodyUsed` dla każdego endpointu.

**Contract**: w sekcjach, gdzie odpowiednie konto jest zalogowane i znane są `groupId()`,
`childId`, `eventId`:
- POST `/api/groups/children/update` z `child_id = "not-a-uuid"` → 404;
- POST `/api/groups/children/delete` z `child_id = "not-a-uuid"` → 404;
- POST `/api/groups/events/update` z `event_id = "not-a-uuid"` i poprawną datą → 404;
- POST `/api/groups/events/delete` z `event_id = "not-a-uuid"` → 404;
- POST `/api/groups/invite` jako członek nie-admin (blok `:382-397`) z prawdziwym `groupId()` → 404.

#### 3. Ciało nie-formularzowe: jeden krok na rodzinę

**File**: `scripts/smoke.mjs`

**Intent**: Przypiąć poprawkę signup-with-profile F6 dla każdego wariantu `catch`.

**Contract** (dokładne oczekiwania z `catch` w handlerach, research §A):
- auth: POST `/api/auth/signup` z JSON → `{ status: 302, locationExact: "/auth/signup?error=invalid_input" }`;
- admin: POST `/api/admin/groups` z JSON (anonim) → `{ status: 302, locationExact: "/admin/groups?error=invalid_input" }`;
- groups/**: POST `/api/groups/children` z JSON jako zalogowany członek → `{ status: 404 }`;
- join: POST `/api/groups/join` z pustym ciałem bez `Content-Type` → `{ status: 302, locationExact: "/join/invalid" }`.

#### 4. Zaostrzenie istniejących asercji

**File**: `scripts/smoke.mjs`

**Intent**: Usunąć antywzorzec „302 = sukces” z istniejących kroków.

**Contract**:
- Każde wylogowanie (`location: "/"`, kroki `:236,249,275,289,306,317,398,538,627,636`) →
  `locationExact: "/"` (`src/pages/api/auth/signout.ts` przekierowuje zawsze na `/`).
- Każde logowanie/rejestracja bez zaproszenia z `location: "/dashboard"` (kroki
  `:226,244,253,279,298,401,541,631`) → `locationExact: "/dashboard"`.
- `:221` „signup rejects missing nick” → `locationExact: "/auth/signup?error=invalid_nick"`.
- `:239` „signin rejects wrong password” → `locationExact: "/auth/signin?error=invalid_credentials"`.
- Numery linii są z commitu `fab2a04`. Po fazie 1 przesuną się, więc implementer odnajduje kroki
  po nazwie i oczekiwanym `location`.

### Success Criteria:

#### Automated Verification:

- `npm run smoke` przechodzi w całości
- `npm run lint` przechodzi
- Celowe zepsucie: `request.formData()` bez `clone()` w `src/pages/api/groups/children/update.ts` daje FAIL `-> 500` kroku 404; cofnięte
- Celowe zepsucie: usunięcie `try/catch` wokół `formData()` w `src/pages/api/auth/signup.ts` daje FAIL kroku JSON; cofnięte

#### Manual Verification:

- Każdy nowy krok z ciałem nie-formularzowym trafia w gałąź `catch` (sprawdzone w biegu: odpowiedź to kod z `catch`, nie kod walidacji pola)
- Żaden zaostrzony krok nie zrobił się czerwony; jeśli tak, przyczyna jest opisana jako błąd aplikacji, a asercja nie została poluzowana

---

## Faza 5: Weryfikacja jak w CI i cookbook

### Overview

Pełna weryfikacja i zapis wzorca w planie testów.

### Changes Required:

#### 1. Cookbook §6.4 i notatka §6.5

**File**: `context/foundation/test-plan.md`

**Intent**: Zastąpić „TBD” w §6.4 wzorcem, który ta faza wprowadziła, i dopisać notatkę fazy 4
w §6.5. Statusu §3 nie zmieniać (należy do `/10x-test-plan`).

**Contract**: §6.4 w stylu §6.1–§6.3 (wyrocznia, warstwa, przypadki graniczne, dowód, wzorce):
- wyrocznia: ograniczenie `check` z migracji, decyzja z archiwum, kontrakt „404 = brak prawa”;
  nigdy wartość z kodu;
- warstwa: mapper i schemat → Vitest obok modułu; czytanie ciała, `rewrite` i status HTTP →
  smoke;
- reguła nowego endpointu: `request.clone().formData()` przed każdym `rewrite`, krok smoke na
  ścieżce 404, kroki przekierowań z `locationExact` i dokładnym kodem;
- ciało nie-formularzowe: JSON lub puste bez `Content-Type`, nie pusty formularz urlencoded;
- dowód: celowe zepsucie (`clone()`, `try/catch`, gałąź mappera);
- wzorce: nowe pliki testów i sekcje smoke.

§6.5: żywy 500 w endpointach admina znaleziony i naprawiony; eksport mapperów zapisu; do
backportu w `/10x-test-plan`: korekty §2 z research („Korekty do planu testów”) i kandydat na
bramkę fazy 5 (lint `clone()` przed `rewrite`).

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm test`, `npm run build` przechodzą
- `npx supabase test db` przechodzi
- `npm run smoke` przechodzi przeciw `npm run preview` (build produkcyjny, jak w CI)
- §6.4 w `context/foundation/test-plan.md` nie zawiera już „TBD”

#### Manual Verification:

- Przegląd §6.4: osoba dodająca nowy endpoint wie, jaki krok smoke i jakie testy Vitest dopisać

---

## Testing Strategy

### Unit Tests:

- Mappery błędów (group, auth, zapis w 4 serwisach), `joinRedirect`, mappery pól i schematy zod.
- Kluczowe przypadki: nieznany kod → `unknown`, P0001 spoza listy, spreparowany parametr e-mail,
  granice długości i miejsc, lata 9999/0999/0000, seria `99999-0x1-01`, marża startu 60 s.

### Integration Tests:

- Smoke (`scripts/smoke.mjs`) przeciw działającej aplikacji i lokalnemu Supabase: kroki 404 dla
  12/12 endpointów z `rewrite`, ciało nie-formularzowe × 4 rodziny, dokładne przekierowania.

### Manual Testing Steps:

1. Faza 1: zapisać czerwony bieg smoke (500) przed poprawką.
2. Fazy 2–4: każde celowe zepsucie z kryteriów, potwierdzenie czerwieni, cofnięcie.
3. Faza 5: przegląd §6.4 oczami osoby dodającej endpoint.

## Performance Considerations

Smoke dostaje ~17 kroków (4 F9, 5 × 404, 4 × ciało, kontrola admina i kroki pomocnicze), czyli
kilka sekund więcej. Test serii z `99999-0x1-01` ma budżet < 100 ms i przy regresji łapie pętlę
CPU, zanim zawiśnie CI.

## Migration Notes

Brak migracji bazy. Kod produkcyjny: `clone()` w 2 endpointach (faza 1) i eksport/wydzielenie
mapperów bez zmiany zachowania (faza 3).

## References

- Research: `context/changes/testing-api-error-paths/research.md`
- Plan testów: `context/foundation/test-plan.md` (§2 ryzyko #5, §3 faza 4, §6.1–6.3 styl cookbooka)
- Wzorzec `clone()`: `src/pages/api/groups/invite.ts:15-16`
- Poprzednia naprawa tego samego błędu: `context/archive/2026-11-12-parent-adds-child/reviews/impl-review.md:82-93`
- Precedens `locationExact`: `context/archive/2026-11-17-event-plan-ui/reviews/impl-review.md:29-37`
- F9: `context/archive/2026-11-10-app-admin-creates-group/follow-ups/review-fixes.md:10`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: F9 — 404 zamiast 500 w endpointach admina

#### Automated

- [x] 1.1 Przed poprawką `npm run smoke` raportuje FAIL z 500 dla obu nowych kroków nie-admina i dla kroku anonima — 16c0d18
- [x] 1.2 Po poprawce `npm run smoke` przechodzi w całości — 16c0d18
- [x] 1.3 `npm run lint`, `npx astro check`, `npm test` przechodzą — 16c0d18

#### Manual

- [x] 1.4 Wynik czerwonego biegu (nazwy kroków + `-> 500`) jest zapisany w opisie commita lub PR — 16c0d18

### Phase 2: Vitest — czyste mappery i schematy

#### Automated

- [x] 2.1 `npm test` przechodzi z nowymi plikami testów
- [x] 2.2 `npm run lint` i `npx astro check` przechodzą
- [x] 2.3 Celowe zepsucie: usunięcie `.filter(Number.isFinite)` w `src/lib/time.ts` daje czerwony test roku 9999; cofnięte
- [x] 2.4 Celowe zepsucie: usunięcie `seriesCheckOptions` z `generateEventsSchema` daje czerwony test `99999-0x1-01`; cofnięte
- [x] 2.5 Celowe zepsucie: `groupRpcFailure` zwracające `forbidden` dla każdego P0001 daje czerwony test; cofnięte

#### Manual

- [x] 2.6 Przegląd: żadna oczekiwana wartość w nowych testach nie jest wyliczana funkcją pod testem ani importowaną stałą z modułu pod testem

### Phase 3: Eksport mapperów zapisu i ich testy

#### Automated

- [ ] 3.1 `npm test` przechodzi
- [ ] 3.2 `npm run lint` i `npx astro check` przechodzą
- [ ] 3.3 `npm run smoke` przechodzi (zachowanie endpointów bez zmian)
- [ ] 3.4 Celowe zepsucie: `childWriteResult` traktujące `rows = []` jako sukces daje czerwony test; cofnięte
- [ ] 3.5 Celowe zepsucie: `driverWriteResult` mapujące nieznany kod na `invalid_seats` daje czerwony test; cofnięte

### Phase 4: Smoke — ścieżki błędu handlerów

#### Automated

- [ ] 4.1 `npm run smoke` przechodzi w całości
- [ ] 4.2 `npm run lint` przechodzi
- [ ] 4.3 Celowe zepsucie: `request.formData()` bez `clone()` w `src/pages/api/groups/children/update.ts` daje FAIL `-> 500` kroku 404; cofnięte
- [ ] 4.4 Celowe zepsucie: usunięcie `try/catch` wokół `formData()` w `src/pages/api/auth/signup.ts` daje FAIL kroku JSON; cofnięte

#### Manual

- [ ] 4.5 Każdy nowy krok z ciałem nie-formularzowym trafia w gałąź `catch` (sprawdzone w biegu: odpowiedź to kod z `catch`, nie kod walidacji pola)
- [ ] 4.6 Żaden zaostrzony krok nie zrobił się czerwony; jeśli tak, przyczyna jest opisana jako błąd aplikacji, a asercja nie została poluzowana

### Phase 5: Weryfikacja jak w CI i cookbook

#### Automated

- [ ] 5.1 `npm run lint`, `npx astro check`, `npm test`, `npm run build` przechodzą
- [ ] 5.2 `npx supabase test db` przechodzi
- [ ] 5.3 `npm run smoke` przechodzi przeciw `npm run preview` (build produkcyjny, jak w CI)
- [ ] 5.4 §6.4 w `context/foundation/test-plan.md` nie zawiera już „TBD”

#### Manual

- [ ] 5.5 Przegląd §6.4: osoba dodająca nowy endpoint wie, jaki krok smoke i jakie testy Vitest dopisać
