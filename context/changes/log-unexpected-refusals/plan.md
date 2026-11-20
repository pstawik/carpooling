# Logowanie nieoczekiwanych odmów (G-1, G-2) — plan implementacji

## Overview

Odmowy z bazy (RLS/RPC `42501`, 0 wierszy, `23503`), które dziś kończą się cichym
`rewrite("/404")` w `src/pages/api/groups/**`, oraz brak własnego członkostwa w
`getGroupWithAdmins` mają zostawiać wpis w logach Workers. Użytkownik dalej widzi 404, więc
istnienie grup nie wycieka. To krok 2 planu `context/audits/observability/2026-11-19_groups-fix-plan.md`
i zamyka G-1 oraz G-2 z audytu `context/audits/observability/2026-11-19_groups.md`.

## Current State Analysis

- Każdy endpoint w `src/pages/api/groups/**` mapuje odmowę z bazy na `rewrite("/404")` bez
  logu. Logowana jest tylko gałąź `unknown` (`console.error("<op> failed:", code, message)`).
- Migracja, która zepsuje politykę albo odbierze `EXECUTE` na `set_child_attendance` /
  `set_event_driver`, daje każdemu rodzicowi 404 na podstawowej akcji PRD i nie zostawia
  żadnego śladu (G-1, krytyczne).
- `getGroupWithAdmins` (`src/lib/services/groups.ts:73-77`) zwraca `null`, gdy grupy nie widać
  albo gdy grupa jest widoczna, a na liście `group_members` nie ma wiersza wołającego. Drugi
  przypadek jest normalny tylko dla nie-członka app admina (RLS pozwala mu czytać grupę).
  Dla każdego innego oznacza zepsute RLS i cichy 404 na stronie grupy, terminu i statystyk (G-2).

### Key Discoveries:

- Wzorzec do powielenia: `src/lib/auth-error.ts:36-46` (`authErrorLogFields`), czyli czysta
  funkcja kopiująca z błędu tylko pola z białej listy, z testem `src/lib/auth-error.test.ts`.
- Logi mają przed sobą `// eslint-disable-next-line no-console -- surfaces in Cloudflare Worker logs`
  (np. `src/middleware.ts:40-44`).
- `42501` w `attendance.ts:39-52` i `driver.ts:76-90` oznacza też „termin już się zaczął”. To
  normalna sytuacja, która ma komunikat (`attendance_locked`, `driver_locked`) i **nie** jest
  logowana. Gdy termin jest nadchodzący, odmowa „should not happen” dla członka.
- Wycofanie kierowcy na nadchodzącym terminie bez wiersza (`driver.ts:91`) to podwójny klik
  albo nieaktualna strona. To normalne i bez logu.
- `context.locals.isAppAdmin` **nie jest liczone** na `/groups/*`: `needsAppAdminFlag`
  (`src/middleware.ts:20-22`) obejmuje tylko `/dashboard` i `/admin/*`. Rolę app admina dla G-2
  trzeba więc sprawdzić w serwisie (RPC `is_app_admin`, ten sam co `src/middleware.ts:73`).
- `test-plan.md` §6.4: Vitest tylko dla czystych funkcji, klienta Supabase nie mockujemy. Smoke
  sprawdza status/`rewrite`, ale nie czyta logów serwera.

## Desired End State

- Każda gałąź odmowy, która w `src/pages/api/groups/**` daje 404 po zapytaniu do bazy, wypisuje
  jeden wpis `"unexpected refusal:"` z obiektem
  `{ event: "unexpected_refusal", op, code, message, groupId?, eventId?, childId?, userId }`.
  Poziom `error` mają gałęzie „should not happen”, `warn` cała reszta.
- `getGroupWithAdmins` dla grupy widocznej bez własnego członkostwa sprawdza `is_app_admin`.
  Jeśli użytkownik nie jest app adminem albo RPC padnie, wypisuje wpis `error` z
  `op: "getGroupWithAdmins"`. Dla app admina nie ma wpisu.
- Odpowiedzi HTTP bez zmian (404 i te same przekierowania), więc smoke przechodzi bez edycji.
- W logu nigdy nie ma imion, nicków, e-maili, tokenów zaproszeń, `details` ani `hint`, tylko
  UUID, nazwa operacji, `code` i `message`.

## What We're NOT Doing

- Nie zmieniamy statusów ani przekierowań (gałąź `unknown` → 500/503 to decyzja kroku 4).
- Nie przepinamy istniejących 26 linii `console.error` na nowy format (krok 4,
  `structured-error-logs`). Nowy helper jest jednak w tym samym kształcie (`event`), żeby krok 4
  go rozszerzył.
- Nie dodajemy `cause` / `code` do `throw new Error(...)` w serwisach (krok 3).
- Nie logujemy błędów parsowania formularza i walidacji zod (`rewrite("/404")` przed
  zapytaniem do bazy). To zwykłe złe wejście (P-4 w audycie).
- Nie ruszamy `src/pages/api/admin/**` ani `join.ts` (poza zakresem G-1).
- Nie rozszerzamy `needsAppAdminFlag` w middleware (dodatkowe RPC na każdym żądaniu strony grupy).
- Nie automatyzujemy dowodu logowania w smoke (wymagałoby przechwytywania stdout serwera).

## Implementation Approach

Jeden mały moduł `src/lib/refusal-log.ts` buduje pola z białej listy (czysta funkcja z testem) i
wypisuje wpis na wybranym poziomie. Każda trasa woła go jedną linią tuż przed `rewrite("/404")`.
Dla G-2 decyzja „logować czy nie” po wyniku `is_app_admin` jest wydzielona do czystej funkcji w
`groups.ts`. RPC jest wołane tylko na rzadkiej gałęzi, więc normalna ścieżka strony grupy nie ma
dodatkowego zapytania.

## Critical Implementation Details

- **Kolejność w `attendance.ts`:** dzisiejsza linia `:52` obsługuje naraz „termin nieznaleziony”
  (`event === null`, obca grupa) i „termin nadchodzący”. Trzeba ją rozbić: `event === null`
  oznacza `warn`, nadchodzący termin `error`, w obu przypadkach z tym samym 404. Błąd `42501`
  pochodzi z `outcome.error` z pierwotnego zapisu, nie z `getGroupEvent`.
- **`driver.ts`:** przy `!event` (`:84`) i przy `set` na nadchodzącym terminie (`:89`) logujemy
  błąd z `setEventDriver`, gdy był (`action === "set"`). Przy wycofaniu z 0 wierszami błędu nie ma,
  więc `code`/`message` zostają puste.

## Faza 1: Helper i odmowy w API (G-1)

### Overview

Wspólny helper z białą listą pól i jego podpięcie na każdej gałęzi odmowy w
`src/pages/api/groups/**`.

### Changes Required:

#### 1. Helper logu odmowy

**File**: `src/lib/refusal-log.ts` (nowy)

**Intent**: Jedno miejsce, które z dowolnego błędu bazy i identyfikatorów buduje wpis bez PII i
wypisuje go na wybranym poziomie. Dzięki temu trasy nie powielają kształtu, a krok 4 rozszerzy
jeden moduł.

**Contract**:
- `refusalLogFields(op: string, error: unknown, ids: RefusalIds): RefusalLogFields`: czysta
  funkcja. `RefusalIds = { userId: string; groupId?: string; eventId?: string; childId?: string }`.
  Wynik to `{ event: "unexpected_refusal", op, code, message, ...ids }`. `code` i `message` są
  odczytywane jak w `auth-error.ts` (tylko stringi, nic poza tymi dwoma polami z błędu), a
  `error` równe `null`/`undefined` daje `undefined` w obu.
- `logUnexpectedRefusal(level: "warn" | "error", op, error, ids): void` wypisuje
  `console[level]("unexpected refusal:", refusalLogFields(...))` z komentarzem `eslint-disable`
  jak w middleware.

#### 2. Test helpera

**File**: `src/lib/refusal-log.test.ts` (nowy)

**Intent**: Pilnuje białej listy i stałego pola `event`, od których zależą przyszłe filtry w
Workers Logs.

**Contract**: przypadki: błąd PostgREST `{ code, message, details, hint }` z dopisanym polem
`token` daje tylko `code` i `message` (bez `details`, `hint`, `token`); `null` i string jako błąd
dają `code`/`message` równe `undefined`; podane id są przepisane, a niepodane nie pojawiają się
jako klucze z wartością. Wartość `"unexpected_refusal"` jest wpisana w teście dosłownie, nie
importowana (§6.4).

#### 3. Podpięcie w trasach

**Files** i gałęzie (każda dalej kończy się `rewrite("/404")`):

| Plik | Gałąź | `op` | Poziom | id |
|---|---|---|---|---|
| `src/pages/api/groups/children.ts:41` | `forbidden` | `addChild` | warn | groupId, userId |
| `src/pages/api/groups/children/update.ts:39` | `forbidden` | `renameChild` | warn | groupId, childId, userId |
| `src/pages/api/groups/children/delete.ts:36` | `forbidden` | `deleteChild` | warn | groupId, childId, userId |
| `src/pages/api/groups/events.ts:41` | `forbidden` | `addEvent` | warn | groupId, userId |
| `src/pages/api/groups/events/update.ts:40` | `forbidden` | `updateEvent` | warn | groupId, eventId, userId |
| `src/pages/api/groups/events/delete.ts:35` | `forbidden` | `deleteEvent` | warn | groupId, eventId, userId |
| `src/pages/api/groups/events/generate.ts:40` | `forbidden` | `generateEvents` | warn | groupId, userId |
| `src/pages/api/groups/invite.ts:35` | `forbidden` | `regenerateGroupInvite` | warn | groupId, userId |
| `src/pages/api/groups/events/attendance.ts:38` | `not_found` | `setChildAttendance` | warn | groupId, eventId, childId, userId |
| `src/pages/api/groups/events/attendance.ts:52` | `forbidden`, `event === null` | `setChildAttendance` | warn | j.w. |
| `src/pages/api/groups/events/attendance.ts:52` | `forbidden`, termin nadchodzący | `setChildAttendance` | **error** | j.w. |
| `src/pages/api/groups/events/driver.ts:84` | odmowa, `!event` | `setEventDriver` / `withdrawEventDriver` | warn | groupId, eventId, userId |
| `src/pages/api/groups/events/driver.ts:89` | `set` odrzucony na nadchodzącym terminie | `setEventDriver` | **error** | groupId, eventId, userId |

**Intent**: Każda odmowa po zapytaniu do bazy zostawia ślad, a poziom `error` odróżnia zepsutą
politykę od zwykłej odmowy dla obcego użytkownika.

**Contract**: `userId` z `context.locals.user.id`. Błąd to `outcome.error` (opcjonalny, bo nie
każda ścieżka go niesie). W `driver.ts` błąd z `setEventDriver` trzeba zachować w zmiennej obok
`refused`. W `attendance.ts` i `driver.ts` trzeba poprawić komentarze nad zmienionymi gałęziami.
Gałęzie bez zmian: `attendance_locked`, `driver_locked`, wycofanie kierowcy z 0 wierszami na
nadchodzącym terminie, walidacja wejścia.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą, w tym nowy `src/lib/refusal-log.test.ts`: `npm test`
- Lint (z `check-ui-literals`) przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi bez zmian w `scripts/smoke.mjs` (odpowiedzi 404 bez zmian): `npm run smoke`

#### Manual Verification:

- Na `npm run dev` POST na `/api/groups/events/attendance` ze spreparowanym `event_id` obcej
  grupy daje 404 i jeden wpis `warn` `unexpected refusal:` z `op: "setChildAttendance"` i bez imion, nicków ani tokenów
- Lokalnie odebrane `EXECUTE` na `set_event_driver` (`revoke execute ... from authenticated`) i
  „jadę” na nadchodzącym terminie dają 404 oraz wpis `error` z `op: "setEventDriver"`; potem
  `npx supabase db reset`
- Na zaczętym terminie dalej widać komunikat `driver_locked` / `attendance_locked` bez wpisu odmowy

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne
potwierdzenie przed fazą 2.

---

## Faza 2: Brak własnego członkostwa (G-2)

### Overview

`getGroupWithAdmins` loguje grupę widoczną bez własnego członkostwa, jeśli wołający nie jest app
adminem. Rolę sprawdza RPC wołane tylko na tej gałęzi.

### Changes Required:

#### 1. Decyzja i log w serwisie

**File**: `src/lib/services/groups.ts`

**Intent**: Odróżnić normalny przypadek (nie-członek app admin) od zepsutego RLS bez dokładania
zapytania na normalnej ścieżce strony grupy.

**Contract**:
- Nowa eksportowana czysta funkcja
  `missingMembershipLogLevel(appAdminCheck: { data: boolean | null; error: { code?: string; message?: string } | null }): "error" | null`
  zwraca `null` tylko dla `data === true` bez błędu. Dla `false`, `null` i błędu RPC zwraca `"error"`.
- W `getGroupWithAdmins`: gdy `group` istnieje, a `me` brak, wywołaj `supabase.rpc("is_app_admin")`
  (typowanie jak w `src/middleware.ts:73`). Jeśli poziom nie jest `null`, wywołaj
  `logUnexpectedRefusal("error", "getGroupWithAdmins", rpcError ?? null, { groupId, userId })`.
  Funkcja dalej zwraca `null`. Sygnatura i trzy strony (`groups/[id].astro`,
  `terminy/[eventId].astro`, `statystyki.astro`) bez zmian.
- Zaktualizuj JSDoc funkcji: opisz gałąź z logiem.

#### 2. Test decyzji

**File**: `src/lib/services/groups.test.ts` (nowy)

**Intent**: Pilnuje, że app admin nie generuje fałszywego wpisu, a błąd RPC nie wycisza logu.

**Contract**: przypadki `{ data: true, error: null }` → `null`; `{ data: false, error: null }` →
`"error"`; `{ data: null, error: { code: "PGRST301", ... } }` → `"error"`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą, w tym nowy `src/lib/services/groups.test.ts`: `npm test`
- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke przechodzi bez zmian: `npm run smoke`

#### Manual Verification:

- Na `npm run dev` z lokalnie wyłączoną polityką SELECT na `group_members` (grupa widoczna, wiersz członkostwa ukryty) członek na `/groups/<id>` dostaje 404 i wpis `error` z `op: "getGroupWithAdmins"`; potem `npx supabase db reset`
- App admin, który nie jest członkiem, na `/groups/<id>` dostaje 404 bez wpisu odmowy
- Członek na własnej grupie widzi stronę normalnie i bez wpisu

---

## Testing Strategy

### Unit Tests:

- `src/lib/refusal-log.test.ts`: biała lista pól (brak `details`, `hint`, dodatkowych pól),
  dosłowne `event: "unexpected_refusal"`, błąd `null`/nie-obiekt, przepisanie id.
- `src/lib/services/groups.test.ts`: `missingMembershipLogLevel` dla app admina, nie-admina i
  błędu RPC.

### Integration Tests:

- Smoke (`npm run smoke`) bez zmian potwierdza, że kontrakt 404 / przekierowań się nie zmienił.

### Manual Testing Steps:

1. `npx supabase start`, `npm run dev`, zalogować się jako rodzic z seeda.
2. POST z obcym `event_id` na attendance i sprawdzić `warn` w konsoli workerd.
3. Odebrać `EXECUTE` na `set_event_driver`, kliknąć „jadę” na nadchodzącym terminie i sprawdzić `error`.
4. Wyłączyć politykę SELECT na `group_members`, wejść na własną grupę i sprawdzić `error` od `getGroupWithAdmins`.
5. `npx supabase db reset`.

## Performance Considerations

Normalna ścieżka bez zmian. RPC `is_app_admin` jest wołane tylko na gałęzi „grupa widoczna, brak
członkostwa” (app admin poza swoją grupą albo zepsute RLS).

## References

- Plan poprawek: `context/audits/observability/2026-11-19_groups-fix-plan.md` (krok 2)
- Audyt: `context/audits/observability/2026-11-19_groups.md` (G-1, G-2)
- Wzorzec białej listy: `src/lib/auth-error.ts:36-46`, `src/lib/auth-error.test.ts`
- Wzorzec testów: `context/foundation/test-plan.md` §6.4
- Poprzedni krok: `context/archive/2026-11-19-middleware-auth-error-logging/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Helper i odmowy w API (G-1)

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą, w tym nowy `src/lib/refusal-log.test.ts`: `npm test`
- [x] 1.2 Lint (z `check-ui-literals`) przechodzi: `npm run lint`
- [x] 1.3 Typy przechodzą: `npx astro check`
- [x] 1.4 Build przechodzi: `npm run build`
- [x] 1.5 Smoke przechodzi bez zmian w `scripts/smoke.mjs` (odpowiedzi 404 bez zmian): `npm run smoke`

#### Manual

- [x] 1.6 Spreparowany `event_id` na attendance daje 404 i wpis `warn` bez PII
- [x] 1.7 Odebrane `EXECUTE` na `set_event_driver` daje 404 i wpis `error` dla „jadę” na nadchodzącym terminie
- [x] 1.8 Zaczęty termin dalej daje `driver_locked` / `attendance_locked` bez wpisu odmowy

### Phase 2: Brak własnego członkostwa (G-2)

#### Automated

- [ ] 2.1 Testy jednostkowe przechodzą, w tym nowy `src/lib/services/groups.test.ts`: `npm test`
- [ ] 2.2 Lint przechodzi: `npm run lint`
- [ ] 2.3 Typy przechodzą: `npx astro check`
- [ ] 2.4 Build przechodzi: `npm run build`
- [ ] 2.5 Smoke przechodzi bez zmian: `npm run smoke`

#### Manual

- [ ] 2.6 Ukryty wiersz członkostwa daje 404 i wpis `error` od `getGroupWithAdmins`
- [ ] 2.7 Nie-członek app admin dostaje 404 bez wpisu odmowy
- [ ] 2.8 Członek na własnej grupie widzi stronę bez wpisu
