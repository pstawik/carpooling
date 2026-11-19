# Logowanie błędów Supabase Auth w middleware: plan implementacji

## Overview

`src/middleware.ts` ignoruje `error` z `supabase.auth.getUser()`. Każda awaria Supabase Auth
(błąd sieci, 5xx, `AuthRetryableFetchError`) wygląda więc jak masowe wylogowanie: chronione
trasy dostają 302 na `/auth/signin`, a w Workers Logs nie ma żadnego wpisu. Zmiana klasyfikuje
błąd Auth i loguje go bez PII. Na trasach chronionych i na `/api/*` awaria daje 503, a nie
przekierowanie na logowanie. Zamyka finding P-1 z `context/audits/observability/2026-11-19_groups.md`
(krok 1 planu poprawek, GitHub issue #79).

## Current State Analysis

- `src/middleware.ts:20-23` czyta tylko `data.user`, a `error` jest odrzucany.
  `src/middleware.ts:51-55` przekierowuje na `/auth/signin`, gdy `locals.user` jest `null`,
  ale tylko dla `PROTECTED_ROUTES = ["/dashboard", "/admin", "/groups"]`.
- `GoTrueClient._getUser` (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2724-2734`)
  przy każdym `AuthError` **zwraca** `{ data: { user: null }, error }`. Wyjątek przepuszcza tylko
  dla błędu, który nie jest `AuthError`. Klasy błędów:
  - `AuthSessionMissingError`: brak ciasteczka albo sesji. Powstaje bez wywołania sieciowego
    (`GoTrueClient.js:2714-2716`) albo przy nieaktywnym `session_id`.
  - `AuthApiError` ze statusem 4xx: wygasły lub nieważny JWT, `refresh_token_not_found`, a także
    401 dla każdego zalogowanego, gdy deploy ma błędny `SUPABASE_KEY`.
  - `AuthRetryableFetchError`: status 0 (sieć/DNS) albo 5xx i 52x Cloudflare
    (`lib/fetch.js:32-53`). Do tego `AuthUnknownError` (odpowiedź, której nie da się sparsować).
- Endpointy `/api/*` nie są w `PROTECTED_ROUTES`. Każdy sam robi
  `if (!context.locals.user) return context.redirect("/auth/signin")`
  (np. `src/pages/api/groups/events/attendance.ts:12-14`). Podczas awarii zapis deklaracji też
  kończy się więc na logowaniu.
- Istniejący wzorzec 503: `src/pages/join/[token].astro:28` ustawia
  `Astro.response.status = 503`. Strona statusu na wzór 404: `src/pages/404.astro`, która używa
  jeszcze klas palety i nie jest na liście `CLEANED_VIEWS`.
- Konwencja logów: `console.error` z `// eslint-disable-next-line no-console -- surfaces in
  Cloudflare Worker logs` (`src/middleware.ts:34-35`). ESLint ma `no-console: "warn"`.

## Desired End State

- Brak sesji (`AuthSessionMissingError`): zachowanie bez zmian i bez logu.
- Odrzucona sesja (`AuthApiError` 4xx): użytkownik jest traktowany jak niezalogowany (zwykły
  redirect na trasach chronionych). W logu jest jedna linia `console.warn` z `name`, `status`,
  `code` i ścieżką.
- Awaria (każdy inny błąd): jedna linia `console.error` z `name`, `status`, `code`, `message` i
  ścieżką. Dalej:
  - trasa chroniona: strona `503.astro` ze statusem 503, komunikatem po polsku i przyciskiem
    „Spróbuj ponownie”;
  - `/api/*`: `Response` 503 z nagłówkiem `Retry-After`, zanim endpoint sprawdzi `locals.user`;
  - pozostałe trasy publiczne (`/`, `/auth/*` stron, `/join/[token]`): log i dalej `user = null`
    jak dziś.
- Żaden log nie zawiera e-maila, tokenów, ciasteczek ani nagłówków.

Weryfikacja: test Vitest dla klasyfikacji, lint, `astro check`, build, `npm run smoke` i ręczny
test z zatrzymanym kontenerem Auth.

### Key Discoveries:

- `getUser()` nie rzuca wyjątku przy błędach Auth: `GoTrueClient.js:2724-2734` (zweryfikowane
  w audycie i ponownie tutaj).
- Predykaty `isAuthSessionMissingError` i `isAuthApiError` są eksportowane z
  `@supabase/auth-js` (`lib/errors.d.ts:47,94`) i działają po `name`/`__isAuthError`, nie po
  `instanceof`. Są więc odporne na zdublowane kopie pakietu w bundlu.
- Użytkownik bez ciasteczka dostaje `AuthSessionMissingError` bez wywołania sieci, więc 503 na
  `/api/auth/*` dotyczy tylko żądań z ciasteczkiem sesji. Formularz logowania (bez sesji) działa
  jak dziś.

## What We're NOT Doing

- Logowanie odmów 42501 i 0 wierszy w `src/pages/api/groups/**` (G-1, G-2): krok 2,
  `log-unexpected-refusals`.
- Dodawanie `error.code` do logów profilu i `is_app_admin` w middleware (`:35`, `:45`, P-3):
  krok 3, `service-error-cause`.
- Strukturalne logi JSON z polem `event` (G-6): krok 4. Tu linia logu ma stały prefiks, ale nie
  jest JSON-em.
- `createClient` zwracający `null` przy braku sekretów (P-2): krok 5.
- Retry `getUser()` w middleware i jakikolwiek cache użytkownika.
- Przerabianie `404.astro` na tokeny ról.
- Error tracker (Sentry itp.).

## Implementation Approach

Klasyfikacja trafia do czystej funkcji w `src/lib/`, testowanej Vitestem. Middleware tylko ją
wywołuje, loguje według wyniku i wybiera odpowiedź. Faza 1 domyka logowanie i 503 dla `/api`, a
trasom chronionym daje tymczasowo tekstowy 503. Faza 2 podmienia go na stronę `503.astro` na
tokenach ról. Już po fazie 1 awaria jest widoczna w logach i nie udaje wylogowania.

## Critical Implementation Details

- **Kolejność w middleware:** decyzja o 503 musi zapaść przed blokiem `PROTECTED_ROUTES`
  (`src/middleware.ts:51-55`). Przy awarii nie wolno też wykonywać zapytań o profil i
  `is_app_admin`: `user` i tak jest `null`, więc obecne warunki je pomijają. Wystarczy tego nie
  zepsuć.
- **Rewrite strony 503:** używać `next("/503")`, nie `context.rewrite("/503")`.
  `context.rewrite` w middleware uruchamia łańcuch middleware od nowa, czyli drugie `getUser()`
  przy trwającej awarii. `next(path)` renderuje stronę docelową bez ponownego wejścia w
  middleware. `/503` nie jest w `PROTECTED_ROUTES` ani pod `/api`, więc nawet bezpośrednie
  wejście na nią nie zapętla się.

## Faza 1: Klasyfikacja i middleware

### Overview

Czysta funkcja klasyfikująca błąd `getUser()` z testem. Middleware loguje według klasy i zwraca
503 przy awarii na `/api/*` i na trasach chronionych (tymczasowo tekstowo).

### Changes Required:

#### 1. Klasyfikacja błędu Auth

**File**: `src/lib/auth-error.ts` (nowy)

**Intent**: Jedno miejsce, które mówi, czy błąd z `getUser()` oznacza „niezalogowany”, „sesja
odrzucona” czy „awaria”, oraz buduje bezpieczny (bez PII) zestaw pól do logu.

**Contract**:
- `classifyAuthError(error: unknown): "none" | "signed_out" | "session_rejected" | "outage"`
  - `null`/`undefined` → `"none"`
  - `isAuthSessionMissingError(error)` → `"signed_out"`
  - `isAuthApiError(error)` i `400 <= status < 500` → `"session_rejected"`
  - wszystko inne (w tym `AuthRetryableFetchError`, `AuthUnknownError`, `AuthApiError` 5xx, obcy
    `Error`) → `"outage"`
- `authErrorLogFields(error: unknown, pathname: string)` zwraca
  `{ name, status, code, message, path }`. Pola, których brak w błędzie, są `undefined`. Nie
  czyta niczego poza tymi właściwościami błędu.
- Predykaty importowane z `@supabase/auth-js`. Jeśli pakiet nie jest bezpośrednią zależnością,
  sprawdzić re-eksport z `@supabase/supabase-js` i użyć tego, co już jest w `package.json`.

#### 2. Test klasyfikacji

**File**: `src/lib/auth-error.test.ts` (nowy)

**Intent**: Przypadki brzegowe klasyfikacji na prawdziwych klasach błędów z auth-js, bez
mockowania sieci.

**Contract**: Przypadki:
- `null` → `none`;
- `new AuthSessionMissingError()` → `signed_out`;
- `AuthApiError` 401 i 403 → `session_rejected`;
- `AuthApiError` 500 → `outage`;
- `AuthRetryableFetchError` ze statusem 0 i 503 → `outage`;
- `AuthUnknownError` → `outage`;
- zwykły `new Error()` → `outage`.

Do tego `authErrorLogFields` nie przenosi pól spoza listy: błąd z dodatkową właściwością `email`
nie ma jej w wyniku.

#### 3. Middleware

**File**: `src/middleware.ts`

**Intent**: Odczytać `error` z `getUser()`, zalogować według klasy i przy awarii zwrócić 503 na
`/api/*` i trasach chronionych, zamiast przepuszczać `user = null` do redirectu na logowanie.

**Contract**:
- `signed_out` i `none`: bez zmian.
- `session_rejected`: `console.warn("auth session rejected:", authErrorLogFields(...))`, dalej
  jak niezalogowany.
- `outage`: `console.error("auth getUser failed:", authErrorLogFields(...))`. Dalej:
  - ścieżka zaczyna się od `/api/`: `new Response("Usługa chwilowo niedostępna", { status: 503,
    headers: { "Retry-After": "30", "Content-Type": "text/plain; charset=utf-8" } })`;
  - trasa chroniona: w tej fazie ten sam tekstowy 503;
  - inne trasy: dalej z `user = null`.
- Komentarze `eslint-disable-next-line no-console` jak w istniejących liniach `:34`, `:44`.

### Success Criteria:

#### Automated Verification:

- Test klasyfikacji przechodzi: `npx vitest run src/lib/auth-error.test.ts`
- Wszystkie testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro check`
- Build przechodzi: `npm run build`

#### Manual Verification:

- `npm run smoke` przechodzi na działającym serwerze (rejestracja, logowanie i wylogowanie bez
  zmian)
- Przy zatrzymanym kontenerze Auth (`docker stop supabase_auth_<projekt>`), zalogowany POST na
  `/api/groups/events/attendance` daje 503 z `Retry-After`, a w logu `wrangler dev` jest linia
  `auth getUser failed:` bez e-maila i tokenów

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie przed fazą 2.

---

## Faza 2: Strona 503

### Overview

Trasy chronione przy awarii renderują stronę `503.astro` na tokenach ról zamiast tekstowego 503.

### Changes Required:

#### 1. Strona 503

**File**: `src/pages/503.astro` (nowy)

**Intent**: Czytelny komunikat po polsku, że usługa jest chwilowo niedostępna i nie chodzi o
wylogowanie. Przycisk „Spróbuj ponownie” przeładowuje bieżący adres.

**Contract**:
- Zawsze ustawia `Astro.response.status = 503` i nagłówek `Retry-After: 30`.
- Układ jak w `404.astro` (`Layout`, wyśrodkowana karta), ale na tokenach ról
  (`bg-background`, `text-foreground`, `text-muted-foreground`, …) i komponentach `Card`/`Button`
  z `src/components/ui/`. Bez klas palety, literałów kolorów i wartości arbitralnych.
- „Spróbuj ponownie” to link do bieżącej ścieżki (z `Astro.url`, który po `next("/503")` wskazuje
  oryginalne żądanie; zweryfikować podczas implementacji, a jeśli tak nie jest, przekazać ścieżkę
  przez `locals`). Na 360 px bez przewijania w poziomie, cel dotyku co najmniej 44 px.

#### 2. Middleware

**File**: `src/middleware.ts`

**Intent**: Dla trasy chronionej przy `outage` zwrócić `next("/503")` zamiast tekstowego 503 z
fazy 1. `/api/*` zostaje przy tekstowym `Response`.

**Contract**: `return next("/503")`, ustawione przed blokiem `PROTECTED_ROUTES`. Patrz „Critical
Implementation Details”.

#### 3. Lista oczyszczonych widoków

**File**: `scripts/check-ui-literals.mjs`

**Intent**: Nowy widok od początku pod strażą skanu literałów UI.

**Contract**: Dopisać `"src/pages/503.astro"` do `CLEANED_VIEWS`.

### Success Criteria:

#### Automated Verification:

- Lint, łącznie z `check-ui-literals`, przechodzi: `npm run lint`
- Sprawdzenie typów przechodzi: `npx astro check`
- Testy jednostkowe przechodzą: `npm test`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Przy zatrzymanym kontenerze Auth zalogowany użytkownik na `/dashboard` i `/groups/<id>` widzi
  stronę 503 (status 503 w DevTools), a nie `/auth/signin`. W logu jest jedna linia
  `auth getUser failed:` na żądanie.
- Po ponownym uruchomieniu kontenera „Spróbuj ponownie” wraca na tę samą stronę zalogowanym
- Strona 503 na 360 px: bez przewijania w poziomie, przycisk co najmniej 44 px, kolory z tokenów
- Wylogowany użytkownik na `/dashboard` przy działającym Auth dalej dostaje 302 na
  `/auth/signin`, bez linii w logu
- `npm run smoke` przechodzi

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się
na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `src/lib/auth-error.test.ts`: tablica klasyfikacji z fazy 1 na prawdziwych klasach błędów
  auth-js i brak PII w `authErrorLogFields`.

### Integration Tests:

- Smoke (`npm run smoke`) potwierdza, że ścieżka bez sesji i z ważną sesją działa jak dawniej.
  Awarii Auth nie automatyzujemy: wymaga zatrzymania kontenera i nie pasuje do CI.

### Manual Testing Steps:

1. `npx supabase start`, `npm run dev`, zaloguj się.
2. `docker stop` na kontenerze Auth (`docker ps | grep auth`).
3. Otwórz `/dashboard`: powinna być strona 503 i linia `auth getUser failed:` w konsoli serwera.
4. Wyślij deklarację z otwartego planu terminu: odpowiedź 503 zamiast przekierowania na logowanie.
5. `docker start` na kontenerze. „Spróbuj ponownie” wraca na stronę zalogowanym.
6. Usuń ciasteczko `sb-*-auth-token`: `/dashboard` daje 302 na `/auth/signin` bez logu.

## Performance Considerations

Bez zmian: middleware dalej wykonuje jedno `getUser()` na żądanie. `next("/503")` nie dokłada
drugiego wywołania.

## Migration Notes

Brak zmian w bazie i RLS.

## References

- Audyt: `context/audits/observability/2026-11-19_groups.md` (P-1)
- Plan poprawek: `context/audits/observability/2026-11-19_groups-fix-plan.md` (krok 1)
- GitHub issue: https://github.com/pstawik/carpooling/issues/79
- auth-js: `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2724-2734`,
  `lib/fetch.js:32-53`, `lib/errors.js:115-122,238-245`
- Wzorzec 503: `src/pages/join/[token].astro:28`; wzorzec strony statusu: `src/pages/404.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Klasyfikacja i middleware

#### Automated

- [x] 1.1 Test klasyfikacji przechodzi: `npx vitest run src/lib/auth-error.test.ts`
- [x] 1.2 Wszystkie testy jednostkowe przechodzą: `npm test`
- [x] 1.3 Lint przechodzi: `npm run lint`
- [x] 1.4 Sprawdzenie typów przechodzi: `npx astro check`
- [x] 1.5 Build przechodzi: `npm run build`

#### Manual

- [x] 1.6 `npm run smoke` przechodzi na działającym serwerze (rejestracja, logowanie i wylogowanie bez zmian)
- [x] 1.7 Przy zatrzymanym kontenerze Auth (`docker stop supabase_auth_<projekt>`), zalogowany POST na `/api/groups/events/attendance` daje 503 z `Retry-After`, a w logu `wrangler dev` jest linia `auth getUser failed:` bez e-maila i tokenów

### Phase 2: Strona 503

#### Automated

- [ ] 2.1 Lint, łącznie z `check-ui-literals`, przechodzi: `npm run lint`
- [ ] 2.2 Sprawdzenie typów przechodzi: `npx astro check`
- [ ] 2.3 Testy jednostkowe przechodzą: `npm test`
- [ ] 2.4 Build przechodzi: `npm run build`

#### Manual

- [ ] 2.5 Przy zatrzymanym kontenerze Auth zalogowany użytkownik na `/dashboard` i `/groups/<id>` widzi stronę 503 (status 503 w DevTools), a nie `/auth/signin`. W logu jest jedna linia `auth getUser failed:` na żądanie.
- [ ] 2.6 Po ponownym uruchomieniu kontenera „Spróbuj ponownie” wraca na tę samą stronę zalogowanym
- [ ] 2.7 Strona 503 na 360 px: bez przewijania w poziomie, przycisk co najmniej 44 px, kolory z tokenów
- [ ] 2.8 Wylogowany użytkownik na `/dashboard` przy działającym Auth dalej dostaje 302 na `/auth/signin`, bez linii w logu
- [ ] 2.9 `npm run smoke` przechodzi
