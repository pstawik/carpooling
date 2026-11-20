# Observability followups (P-2, G-8): plan implementacji

## Overview

Ostatni krok planu napraw observability dla groups
(`context/audits/observability/2026-11-19_groups-fix-plan.md:19,69-74`). Zamyka dwie luki:

- **P-2:** brak sekretów Supabase nie zostawia dziś żadnego wpisu w logach.
- **G-8:** nieudane dołączenie przez zaproszenie wraca na `/join/<token>` bez komunikatu.

Przy okazji `/join/<token>` przy braku konfiguracji przestaje pokazywać mylące 404 „Link
nieaktualny”.

## Current State Analysis

- `createClient` (`src/lib/supabase.ts:5-8`) zwraca `null` przy braku `SUPABASE_URL` lub
  `SUPABASE_KEY` i niczego nie loguje. Middleware woła go przy każdym żądaniu
  (`src/middleware.ts:26`), więc przy `null` wszystkie trasy chronione przekierowują na
  `/auth/signin` (`:79-81`). Użytkownik widzi baner z `Layout.astro:22-34`
  (`src/lib/config-status.ts:11-21`), ale w logach nic się nie pojawia.
- Wszystkie logi idą przez `emitLog`/`logError` (`src/lib/error-log.ts:67-81`) ze stałym polem
  `event`. Unia `ErrorLogEvent` (`:1`) nie ma wartości dla braku konfiguracji.
- `joinRedirect` (`src/lib/services/invites.ts:51-62`) dla `invalid` i `error` zwraca gołe
  `/join/${token}`. Ma 3 wywołania: `api/groups/join.ts:31`, `api/auth/signin.ts:42`,
  `api/auth/signup.ts:48`. Strona `src/pages/join/[token].astro` nie czyta query. Po błędzie
  zalogowany użytkownik widzi więc ten sam formularz „Dołącz do grupy”.
- `[token].astro:17`: przy `supabase === null` lookup nie rusza, `groupName` zostaje `null` i
  strona zwraca 404 „Link nieaktualny” (`:29-30,56-63`), także dla poprawnego tokenu.
- Test `src/lib/services/invites.test.ts:26-28` asertuje dziś `error` → `/join/${TOKEN}`.

## Desired End State

- Przy brakującym sekrecie każdy isolate Workera emituje **dokładnie jeden** wpis
  `{ event: "config_missing", op: "createClient", missing: ["SUPABASE_URL" | "SUPABASE_KEY", …] }`
  na poziomie `error`. Wpis zawiera tylko nazwy zmiennych, nigdy wartości. Zachowanie
  aplikacji (baner, `not_configured`, redirect na signin) się nie zmienia. W produkcji nic nie
  rzuca.
- `/join/<poprawny token>` bez skonfigurowanego Supabase daje 503 „Coś poszło nie tak” (gałąź
  `lookupFailed`) zamiast 404. Niepoprawny token dalej daje 404.
- Nieudany join (`kind: "error"`) przekierowuje na `/join/<token>?error=unknown` ze wszystkich 3
  wywołań. Strona w gałęzi formularza pokazuje nad przyciskiem
  `<Alert variant="destructive">` z tekstem „Coś poszło nie tak, spróbuj ponownie”. Rozpoznaje
  tylko `error === "unknown"`, inne wartości ignoruje. Status zostaje 200 (PRG). Przycisk
  ponowienia pozostaje.
- Weryfikacja: lint, `astro check`, `npm test`, build, `npm run smoke` zielone, plus kroki ręczne
  z faz.

### Key Discoveries:

- `src/lib/supabase.ts` importuje `astro:env/server`, więc w Vitest go nie przetestujemy. Logika
  pól idzie do czystej funkcji w `src/lib/error-log.ts`, a flaga zostaje w `supabase.ts`.
- `ErrorLogFields` (`error-log.ts:12-18`) jest typem wyniku `errorLogFields`. Nowe pole `missing`
  nie powinno go rozszerzać. Dostaje własny typ zwracany przez nową funkcję, analogicznie do
  `authFailedLogFields` (`src/lib/auth-error.ts`, wołane przez `emitLog` w
  `middleware.ts:41,43`).
- Wzorzec whitelisty `?error=` jest w `src/pages/groups/[id]/terminy/[eventId].astro:63`,
  komunikat w `group-errors.ts:30` (`unknown`), a wzorzec `<Alert variant="destructive"
  role="alert">` z `CircleAlert` w `src/pages/groups/[id].astro:115-120`.
- Oracle F2 (`invites.test.ts:9-10`, archiwum `join-group-by-invite-link` impl-review F2) mówi
  „nigdy na stronę wyglądającą na sukces”. Doklejenie `?error=unknown` go nie narusza.

## What We're NOT Doing

- Rzucanie błędu z `createClient` w produkcji ani 503 z middleware przy braku configu. Decyzja:
  tylko log (500 na każdej trasie wyłączyłby baner i stronę główną).
- Zmiana zachowania `invalid` w `joinRedirect`: strona sama daje 404 dla nieaktualnego tokenu.
- Zmiana statusu HTTP strony z `?error=unknown` (zostaje 200, PRG).
- Sprzątanie klas palety w `[token].astro` i dopisanie widoku do `CLEANED_VIEWS`, bo to osobna
  zmiana `/10x-ui`. Nowy Alert używa jednak wyłącznie tokenów.
- Drugi log w `[token].astro` przy braku klienta, bo wpis `config_missing` z `createClient` już
  to pokrywa.
- Log w `config-status.ts` na poziomie modułu (niezweryfikowany moment dostępności sekretów na
  Cloudflare).
- Test E2E dla G-8: nieudanego RPC nie da się wywołać z przeglądarki bez fałszowania backendu.
  Wystarczy test jednostkowy redirectu i ręczny podgląd strony.

## Implementation Approach

Dwie niezależne fazy, każda zamyka jeden identyfikator audytu. Czyste funkcje pokrywają testy
Vitest (`*.test.ts` obok modułu). Kod z `astro:env` i strony Astro weryfikujemy ręcznie i przez
smoke.

## Critical Implementation Details

- **Flaga „raz na isolate”** to zmienna modułowa w `supabase.ts`. Ustawiamy ją **przed**
  `emitLog`, a sprawdzamy w gałęzi `null`. Ścieżka ze skonfigurowanym klientem zostaje bez
  dodatkowej pracy.
- **Komunikat G-8 tylko w gałęzi formularza.** Gałęzie `lookupFailed` (503) i „nieaktualny”
  (404) mają pierwszeństwo, bo token mógł zostać zregenerowany między próbami. Wtedy
  `?error=unknown` nie ma się pokazać.

## Faza 1: Log braku konfiguracji Supabase (P-2)

### Overview

Jeden wpis `config_missing` na isolate, gdy brakuje sekretów Supabase. Zachowanie aplikacji się
nie zmienia.

### Changes Required:

#### 1. Nowy event i pola logu

**File**: `src/lib/error-log.ts`

**Intent**: Dodać `config_missing` do unii zdarzeń i czystą funkcję, która z wartości sekretów
buduje pola wpisu z samymi nazwami brakujących zmiennych.

**Contract**: `ErrorLogEvent` zyskuje `"config_missing"`. Nowa eksportowana funkcja, np.
`configMissingLogFields(env: { SUPABASE_URL?: string; SUPABASE_KEY?: string }):
ConfigMissingLogFields | null`, zwraca `{ event: "config_missing", op: "createClient", missing:
string[] }`, w którym `missing` zawiera nazwy w stałej kolejności (`SUPABASE_URL`,
`SUPABASE_KEY`). Zmienna brakująca to `undefined` albo pusty string. Gdy obie są ustawione,
funkcja zwraca `null`. Wartości zmiennych nigdy nie trafiają do wyniku. `ErrorLogFields` zostaje
bez zmian.

#### 2. Test pól logu

**File**: `src/lib/error-log.test.ts`

**Intent**: Pokryć funkcję przypadkami brzegowymi, m.in. tym, że wartość sekretu nie wycieka do
wyniku.

**Contract**: Nowy `describe("configMissingLogFields")`:
- oba brakują → `missing: ["SUPABASE_URL", "SUPABASE_KEY"]`;
- brakuje tylko klucza → `["SUPABASE_KEY"]`, a w wyniku (`JSON.stringify`) nie ma wartości URL;
- pusty string liczy się jak brak;
- oba ustawione → `null`.

#### 3. Flaga „raz na isolate” w `createClient`

**File**: `src/lib/supabase.ts`

**Intent**: W gałęzi zwracającej `null` przy pierwszym wywołaniu w isolate wyemitować wpis z
funkcji z kroku 1 przez `emitLog("error", …)`. Każde kolejne wywołanie wraca po cichu.

**Contract**: Sygnatura i wynik `createClient` bez zmian. Zmienna modułowa
`configMissingLogged` jest ustawiana przed emisją. Żadnego `console.*` bezpośrednio, tylko
`emitLog`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint (z `check-ui-literals`) przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- `npm run dev` bez `SUPABASE_KEY` w `.dev.vars`: po kilku żądaniach (`/`, `/dashboard`,
  `/auth/signin`) w konsoli jest dokładnie jeden wpis `event: "config_missing"` z `missing:
  ["SUPABASE_KEY"]` i bez wartości URL. Baner i redirect na signin działają jak wcześniej.
- Z pełnym `.dev.vars` żaden wpis `config_missing` się nie pojawia.

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na ręczne
potwierdzenie przed fazą 2.

---

## Faza 2: Komunikat po nieudanym joinie (G-8) i 503 na `/join` bez configu

### Overview

Nieudany join niesie `?error=unknown`, a strona pokazuje komunikat nad formularzem. Brak klienta
Supabase przy poprawnym tokenie daje 503 zamiast 404.

### Changes Required:

#### 1. Redirect dla `error`

**File**: `src/lib/services/invites.ts`

**Intent**: `joinRedirect` dla `kind: "error"` zwraca `/join/${token}?error=unknown`. `invalid`
zostaje na gołym `/join/${token}`. Komentarz przy `case` należy zaktualizować: strona pokazuje
teraz komunikat.

**Contract**: `joinRedirect(result, token): string` bez zmiany sygnatury. Token jest url-safe
(zweryfikowany przez `inviteTokenSchema`), więc nie trzeba go kodować. Zmiana obejmuje wszystkie
3 wywołania (join, signin, signup) bez modyfikacji endpointów.

#### 2. Świadoma aktualizacja testu

**File**: `src/lib/services/invites.test.ts`

**Intent**: Test `error` (`:26-28`) zmienia oczekiwanie na `/join/${TOKEN}?error=unknown`, a jego
tytuł mówi o komunikacie (np. `"error -> back to /join/<token>?error=unknown (F2: not
/dashboard)"`). To celowa zmiana zachowania z tego planu, a nie dopasowanie do kodu. Test
`invalid` (`:22-24`) zostaje bez zmian. Komentarz oracle F2 (`:9-10`) uzupełnić o G-8.

**Contract**: Dwa osobne testy: `invalid` → `/join/${TOKEN}`, `error` →
`/join/${TOKEN}?error=unknown`.

#### 3. Strona `/join/[token]`

**File**: `src/pages/join/[token].astro`

**Intent**:
- (a) Gdy token jest poprawny, a `createClient` zwrócił `null`, ustawić `lookupFailed = true`.
  Strona pokaże wtedy istniejące 503 „Coś poszło nie tak” zamiast 404. Bez dodatkowego logu.
- (b) Odczytać `Astro.url.searchParams.get("error")`. Tylko dla wartości `"unknown"` wyliczyć
  komunikat przez `groupErrorMessage("unknown", null)` z `@/lib/services/group-errors`.
- (c) W gałęzi formularza dla zalogowanego użytkownika pokazać go nad `<form>` jako `<Alert
  variant="destructive" role="alert">` z `CircleAlert` i `AlertDescription`, tak jak w
  `src/pages/groups/[id].astro:115-120`.

**Contract**:
- Niepoprawny token dalej daje 404, a lookup z błędem dalej 503.
- Komunikat renderuje się tylko w gałęzi „poprawny token + `groupName`”, nigdy w gałęziach
  503/404.
- Nieznane wartości `error` nic nie renderują.
- Status strony z `?error=unknown` to 200.
- Alert używa tylko tokenów, żadnych nowych klas palety ani literałów kolorów.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą, w tym zaktualizowany test `error` w `invites.test.ts`: `npm test`
- Lint (z `check-ui-literals`) przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build przechodzi: `npm run build`
- Smoke auth-flow przechodzi na zbudowanym serwerze: `npm run smoke`

#### Manual Verification:

- Zalogowany użytkownik na `/join/<poprawny token>?error=unknown` widzi czerwony Alert „Coś
  poszło nie tak, spróbuj ponownie” nad przyciskiem „Dołącz do grupy”, a ponowienie działa
  (trafia do grupy). Status 200.
- `/join/<poprawny token>?error=cokolwiek` i `/join/<poprawny token>` nie pokazują komunikatu.
- `/join/<nieistniejący token>?error=unknown` pokazuje 404 „Link nieaktualny” bez Alertu.
- Przy 360 px Alert się zawija, nie ma poziomego scrolla, przycisk ma co najmniej 44 px.
- `npm run dev` bez `SUPABASE_KEY`: `/join/<poprawny format tokenu>` daje 503 „Coś poszło nie
  tak” (nie 404). Token o złym formacie dalej daje 404.

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na ręczne
potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `configMissingLogFields`: oba brakują, brakuje jednego, pusty string, oba ustawione → `null`,
  wartość sekretu nie wycieka.
- `joinRedirect`: `error` → `?error=unknown`, `invalid` bez zmian, ścieżki sukcesu bez zmian.

### Integration Tests:

- `npm run smoke` potwierdza, że flow auth (z pełną konfiguracją) się nie zmienił.

### Manual Testing Steps:

1. Usunąć `SUPABASE_KEY` z `.dev.vars` i zrestartować `npm run dev`. Odwiedzić kilka stron,
   sprawdzić jeden wpis `config_missing` i 503 na `/join/<token>`.
2. Przywrócić `.dev.vars`. Jako zalogowany otworzyć `/join/<token>?error=unknown` i sprawdzić
   Alert oraz ponowienie.
3. Sprawdzić `/join/<token>?error=xyz` i nieaktualny token z `?error=unknown`: brak Alertu.

## Performance Considerations

Brak. Flaga modułowa nie kosztuje nic na ścieżce ze skonfigurowanym klientem.

## Migration Notes

Brak migracji DB. Po deployu warto dodać zapytanie lub alert w Workers Logs na
`event = "config_missing"`.

## References

- Research: `context/changes/observability-followups/research.md`
- Audyt: `context/audits/observability/2026-11-19_groups.md` (P-2 `:123`, G-8 `:116`)
- Plan napraw: `context/audits/observability/2026-11-19_groups-fix-plan.md:69-74`
- Helper logów: `src/lib/error-log.ts:1,67-81`; wzorzec `emitLog` z własnymi polami:
  `src/middleware.ts:41,43`
- Wzorzec whitelisty `?error=`: `src/pages/groups/[id]/terminy/[eventId].astro:63`
- Wzorzec Alertu: `src/pages/groups/[id].astro:115-120`
- Decyzja F2: `context/archive/2026-11-12-join-group-by-invite-link/reviews/impl-review.md:67-80`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Log braku konfiguracji Supabase (P-2)

#### Automated

- [x] 1.1 Testy jednostkowe przechodzą: `npm test` — 1308440
- [x] 1.2 Lint (z `check-ui-literals`) przechodzi: `npm run lint` — 1308440
- [x] 1.3 Typy przechodzą: `npx astro check` — 1308440
- [x] 1.4 Build przechodzi: `npm run build` — 1308440

#### Manual

- [x] 1.5 Bez `SUPABASE_KEY`: dokładnie jeden wpis `config_missing` z `missing: ["SUPABASE_KEY"]`, baner i redirect bez zmian — 1308440
- [x] 1.6 Z pełnym `.dev.vars` brak wpisu `config_missing` — 1308440

### Phase 2: Komunikat po nieudanym joinie (G-8) i 503 na `/join` bez configu

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą, w tym zaktualizowany test `error` w `invites.test.ts`: `npm test` — 361f105
- [x] 2.2 Lint (z `check-ui-literals`) przechodzi: `npm run lint` — 361f105
- [x] 2.3 Typy przechodzą: `npx astro check` — 361f105
- [x] 2.4 Build przechodzi: `npm run build` — 361f105
- [x] 2.5 Smoke auth-flow przechodzi na zbudowanym serwerze: `npm run smoke` — 361f105

#### Manual

- [x] 2.6 `?error=unknown` pokazuje Alert nad „Dołącz do grupy”, ponowienie działa, status 200 — 361f105
- [x] 2.7 `?error=cokolwiek` i brak query nie pokazują komunikatu — 361f105
- [x] 2.8 Nieaktualny token z `?error=unknown` daje 404 bez Alertu — 361f105
- [x] 2.9 360 px: Alert się zawija, brak poziomego scrolla, przycisk ≥ 44 px — 361f105
- [x] 2.10 Bez `SUPABASE_KEY`: poprawny format tokenu daje 503, zły format 404 — 361f105
