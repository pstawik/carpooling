---
date: 2026-11-19T06:55:04+01:00
researcher: Claude (Opus 5.5)
git_commit: fab2a04524a90b6e84fa4f0256cf5d2b4cbfd377
branch: testing-rls-isolation-matrix-archive
repository: carpooling
topic: "Ścieżki błędów i walidacja wejścia w API — gdzie błąd backendu lub złe wejście daje 500 albo pozorny sukces (ryzyko #5, rollout Phase 4)"
tags: [research, testing, api, error-paths, validation, zod, smoke, vitest, astro-rewrite]
status: complete
last_updated: 2026-11-19
last_updated_by: Claude (Opus 5.5)
---

# Research: ścieżki błędów i walidacja wejścia w API

**Date**: 2026-11-19T06:55:04+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: fab2a04524a90b6e84fa4f0256cf5d2b4cbfd377
**Branch**: testing-rls-isolation-matrix-archive (drzewo czyste, HEAD = merge #66 + commit archiwizacji)
**Repository**: carpooling

## Research Question

Ugruntować fazę 4 planu testów (`context/foundation/test-plan.md:72`, ryzyko #5): gdy zapytanie
lub RPC zwraca błąd albo wejście jest złośliwe/brzegowe (zły format, rok poza zakresem, puste
ciało), użytkownik ma dostać jawny błąd (4xx lub przekierowanie z kodem błędu), nigdy 500 ani
komunikat sukcesu. Zweryfikować guidance (nie zakładać „końcowe 302 = sukces”; nie mockować
wnętrza klienta Supabase; nie asertować samego statusu), znaleźć istniejące testy, wskazać
najtańszą warstwę i włączyć do smoke F9: zwykły zalogowany użytkownik POST `/api/admin/groups`
→ 404 (`context/archive/2026-11-10-app-admin-creates-group/follow-ups/review-fixes.md:10`).

## Summary

1. **Żywy błąd, potwierdzony w działającej aplikacji.** `POST /api/admin/groups` i
   `POST /api/admin/groups/admins` odpowiadają **500**, a nie 404, gdy RPC odmawia (42501). Oba
   endpointy czytają oryginalne ciało (`src/pages/api/admin/groups.ts:10`,
   `src/pages/api/admin/groups/admins.ts:10`), a potem wołają `context.rewrite("/404")`
   (`groups.ts:33`, `admins.ts:33`). Astro 7.4.4 rzuca wtedy `RewriteWithBodyUsed`
   (`node_modules/astro/dist/core/routing/rewrite.js:123-126`). Sonda 2026-11-19 na
   `localhost:4321` (dev, lokalny Supabase): anonimowy POST z poprawnym formularzem → `500`
   na obu ścieżkach, a treść błędu to „`Astro.rewrite()` cannot be used if the request body has
   already been read”. Zalogowany nie-admin idzie tą samą ścieżką: `create_group` rzuca 42501,
   gdy `not is_app_admin()` (`supabase/migrations/20261110120000_create_groups.sql:154-155`),
   `groupRpcFailure` mapuje 42501 na `forbidden` (`src/lib/services/group-errors.ts:88`), a to
   prowadzi do `rewrite`. **Smoke F9 w obecnym kodzie będzie czerwony**: test łapie prawdziwy
   błąd, więc plan musi zawierać poprawkę (`request.clone().formData()`), a nie zmianę
   oczekiwania. Ten sam błąd był już raz naprawiony w `invite.ts` (parent-adds-child F3), ale
   nie w endpointach admina.
2. **Każdy z 15 endpointów `src/pages/api/**`, które czytają ciało (16. `signout` go nie czyta), łapie nie-formularzowe ciało** w
   `try/catch` wokół `formData()`, ale żaden test tego nie sprawdza (smoke nie wysyła JSON ani
   pustego ciała). Kombinacja „czytanie bez `clone()` + `rewrite`” występuje dokładnie w 2
   plikach z 5, które czytają bez `clone()` (pozostałe 3, `signin`, `signup`, `join`, nie
   wołają `rewrite`).
3. **Mapowanie błędów to głównie czyste, eksportowane funkcje bez testów jednostkowych**:
   `groupRpcFailure`, `createGroupIssueCode`, `addGroupAdminIssueCode`, `adminGroupsErrorUrl`,
   `groupErrorMessage` (`group-errors.ts:88-130`), `authErrorCode`, `signUpIssueCode`,
   `authErrorMessage` (`auth-errors.ts:29-64`), `joinRedirect` (`invites.ts:48-58`),
   `eventFieldError`, `eventSeriesFieldError` (`validation/events.ts:98-107,168-176`) oraz
   schematy zod. To najtańsza warstwa bez mockowania klienta. Wyjątek: `writeResult` w
   `children.ts:25-33` i `events.ts:30-38` są prywatne, a mapowanie w `attendance.ts:59-64` i
   `drivers.ts:64-69` jest wplecione w funkcje asynchroniczne, które biorą klienta.
4. **Poprawki trzech z pięciu cytowanych findingów nie mają testu regresji**: rok
   9999/0999/0000 (group-admin-manages-events F1), zniekształcona data serii → pętla CPU
   (weekly-event-generator F1, CRITICAL) i nie-formularzowe ciało (signup-with-profile F6). W
   `time.test.ts` i `weekly-events.test.ts` nie ma tych przypadków, a `generateEventsSchema`,
   `addEventSchema` i `updateEventSchema` nie mają żadnego testu.
5. **Smoke ma słabe asercje przekierowań**: `location` porównuje prefiks (`scripts/smoke.mjs:657`).
   Prefiks `/` przy wylogowaniu pasuje do każdej ścieżki. Prefiks `/dashboard` przy logowaniu
   przepuściłby `/dashboard?error=…`. Kroki 221 i 239 asertują samo `?error=` bez kodu. Te
   asercje bezpośrednio realizują antywzorzec „końcowe 302 = sukces”.
6. **Błąd backendu („unknown”) jest nieosiągalny ze smoke**: smoke nie ma klucza service-role
   (`.github/workflows/ci.yml:45-52`) ani sposobu na wymuszenie awarii bazy. Gałąź
   `unknown` da się uczciwie sprawdzić tylko jednostkowo na funkcjach mapujących.
7. **Guidance §2 dla ryzyka #5 trzyma się, z dwiema korektami** (patrz „Korekty do planu
   testów”): dla odmowy uprawnień poprawnym jawnym błędem jest 404 (rewrite), a nie przekierowanie
   z kodem; najtańsza warstwa dla błędu z punktu 1 to smoke, bo błąd powstaje w Astro, poza
   funkcjami czystymi.

## Detailed Findings

### A. Kontrakt odpowiedzi endpointów (stan obecny)

Wzorzec potwierdzony w 16 plikach `src/pages/api/**` (przeczytanych w całości):

| Sytuacja | Odpowiedź | Przykład |
|---|---|---|
| brak sesji (endpointy grupowe) | 302 `/auth/signin` | `groups/children.ts:10-12` |
| ciało nie-formularzowe | 404 (rewrite) w `groups/**`; 302 `?error=invalid_input` w auth i admin; 302 `/join/invalid` w join | `groups/events.ts:16-21`, `auth/signup.ts:15-20`, `admin/groups.ts:9-14`, `groups/join.ts:10-15` |
| spreparowane id (zła składnia uuid) | 404 (rewrite) | `groups/events/delete.ts:22-25` |
| błąd pola wpisywanego przez użytkownika | 302 `…?error=<kod>#<sekcja>` | `groups/events.ts:24-28`, `driver.ts:36-39` |
| RLS/RPC 42501 (brak prawa) | 404 (rewrite); w `attendance`/`driver` na rozpoczętym terminie 302 `?error=*_locked` | `admin/groups.ts:33`, `attendance.ts:39-53`, `driver.ts:74-90` |
| UPDATE/DELETE dopasował 0 wierszy | 302 `?error=child_not_found` / `event_not_found` | `children.ts:31`, `events.ts:36` |
| nieznany błąd bazy | `console.error` + 302 `?error=unknown` (bez kotwicy) | `groups/events.ts:42-48`, `invite.ts:36-38` |
| klient Supabase nieskonfigurowany | 302 `?error=not_configured` (wyjątek: `join.ts:27-28` → `/dashboard`) | `generate.ts:32-35` |

Kody w przekierowaniach pochodzą wyłącznie z białych list (`group-errors.ts:9-31`,
`auth-errors.ts:6-20`). Nieznany kod pokazuje komunikat ogólny (`group-errors.ts:126-130`,
`auth-errors.ts:61-64`), więc spreparowany link nie wstrzyknie tekstu.

### B. Błąd `rewrite` po przeczytaniu ciała (żywy)

- Endpointy `groups/**` czytają `context.request.clone().formData()` z komentarzem „Astro
  refuses rewrite("/404") once the original body has been consumed” (np. `groups/events.ts:16-17`).
  Regułę wprowadzono w c81eb1b/13f9caf (parent-adds-child), a `invite.ts` poprawiono po
  `context/archive/2026-11-12-parent-adds-child/reviews/impl-review.md:82-93` (F3).
- `admin/groups.ts:10` i `admin/groups/admins.ts:10` czytają bez `clone()` i wołają `rewrite`
  przy `forbidden` (`:33` w obu plikach). Astro rzuca błąd, gdy metoda nie jest GET/HEAD, a
  `oldRequest.bodyUsed` (`node_modules/astro/dist/core/routing/rewrite.js:123-126`, astro
  7.4.4 z `node_modules/astro/package.json:3`).
- Sonda runtime (2026-11-19, dev server `:4321`, anonimowo, nagłówek `Origin`, poprawny
  formularz): `/api/admin/groups` → `500`, `/api/admin/groups/admins` → `500`, kontrolnie
  `/api/groups/invite` → `302 /auth/signin`. Treść 500 zawiera komunikat `RewriteWithBodyUsed`
  i stos `rewrite.js:125`.
- Ścieżka zalogowanego nie-admina (F9) nie była sondowana, bo wymagałaby utworzenia konta.
  Wniosek wynika z kodu: ta sama gałąź `failure.kind === "forbidden"` (`group-errors.ts:88`), a
  RPC rzuca 42501 dla każdego, kto nie jest adminem aplikacji (migracja `:154-155`). Ostatnia
  i jedyna definicja `create_group`/`add_group_admin` jest w
  `supabase/migrations/20261110120000_create_groups.sql`.
- `/api/admin` nie jest w `PROTECTED_ROUTES` (`src/middleware.ts:5`; `"/api/admin"` nie zaczyna
  się od `"/admin"`). Anonim trafia więc do RPC. Po poprawce dostanie 404 z tej samej gałęzi,
  co jest zgodne z komentarzem „Authorization lives in the create_group RPC” (`admin/groups.ts:6`).
- Warstwa bazy jest pokryta: `supabase/tests/groups_rls.test.sql:141-163` (42501 na zapisach).
  Błąd siedzi w tłumaczeniu na HTTP, którego żaden test nie dotyka.

### C. Funkcje mapujące i schematy: kandydaci na Vitest

Eksportowane, czyste, bez testów (`grep` po `src/**/*.test.ts`: istnieje 5 plików, żaden ich
nie importuje):

- `groupRpcFailure(error)`: 42501 → `forbidden`; P0001 z kluczem z `RPC_ERROR_KEYS`
  (`unknown_email`, `group_not_found`, `no_admins`, `invalid_invite`) → ten kod; P0001 z innym
  komunikatem i każdy inny kod → `unknown` (`group-errors.ts:82-97`). `unknown_email` przenosi
  `error.details` jako e-mail.
- `createGroupIssueCode` / `addGroupAdminIssueCode`: pierwszy błędny field → kod, a w innym
  wypadku `invalid_input` (`group-errors.ts:99-113`).
- `adminGroupsErrorUrl(code, email)`: `email` dołączany tylko przy `unknown_email`
  (`:115-120`).
- `groupErrorMessage` / `authErrorMessage`: nieznany kod → komunikat ogólny;
  `unknown_email` z parametrem, który nie jest e-mailem → tekst ogólny, nie surowy parametr
  (`group-errors.ts:126-130`).
- `authErrorCode`: znane kody GoTrue → kod; każdy inny → `unknown` (`auth-errors.ts:29-44`).
- `signUpIssueCode` (`auth-errors.ts:55-58`).
- `joinRedirect(result, token)`: `joined`/`already_member` → `/groups/<id>?message=<kind>`;
  `invalid`/`error` → `/join/<token>` (`invites.ts:48-58`).
- `eventFieldError`, `eventSeriesFieldError`, `groupIdIfOnlyNameInvalid`: rozstrzygają
  „błąd użytkownika → przekierowanie z kodem” vs „spreparowany formularz → 404”
  (`validation/events.ts:98-107,168-176`; `validation/children.ts`).
- Schematy `addEventSchema`, `updateEventSchema`, `generateEventsSchema`
  (`validation/events.ts:65-162`), `driverSeatsSchema`, `setAttendanceSchema`,
  `createGroupSchema`, `signUpSchema`.

Prywatne lub powiązane z klientem: `writeResult` w `children.ts:25-33` i `events.ts:30-38`
(42501 → `forbidden`, 23505 → `duplicate_*`, 0 wierszy → `*_not_found`, reszta → `unknown`)
oraz mapowanie wewnątrz `setChildAttendance` (`attendance.ts:59-64`: 42501/23503) i
`setEventDriver` (`drivers.ts:64-69`: 42501/23514). Sprawdzenie ich bez mockowania wnętrza
klienta wymaga wyeksportowania mappera (zmiana kodu produkcyjnego ograniczona do `export`)
albo pozostawienia ich smoke'owi, który pokrywa już `duplicate_child`, `duplicate_event`,
`child_not_found` i `invalid_driver_seats` (`smoke.mjs:331,406,495-508,597`).

Ograniczenie: `schemas` używają `Date.now()` (`validation/events.ts:34`), więc test oczekujący
„w przyszłości” potrzebuje albo `vi.useFakeTimers()`/`vi.setSystemTime`, albo dat daleko od
dzisiaj.

### D. Wejście brzegowe: stan poprawek i luki w testach

| Finding (archiwum) | Poprawka | Stan dziś | Test regresji |
|---|---|---|---|
| group-admin-manages-events F1: rok 9999-12-31 23:00 / 0999 / 0000 → RangeError → 500 (`…/reviews/impl-review.md:28-36`) | b86e98c | regex 1000–9999 (`time.ts:54`, `validation/events.ts:18`); niesk. offsety odrzucane (`time.ts:62-64`) | brak: `time.test.ts` nie ma tych lat; schematy bez testu |
| weekly-event-generator F1 (CRITICAL): `date_to="99999-0x1-01"` → NaN → ~5 mln iteracji przed autoryzacją (`…/reviews/impl-review.md:28-40`) | 87f743a | `superRefine` bramkowany `seriesCheckOptions` (`validation/events.ts:124-133,150-157`); `weeklyDates` zwraca `[]` dla niesk./odwróconego/za długiego zakresu (`weekly-events.ts:29-34`) | częściowy: `weekly-events.test.ts:38,42` (odwrócony, >366 dni); brak NaN/zniekształconej daty i testu schematu |
| signup-with-profile F6: JSON/puste ciało → TypeError → 500 (`…/reviews/impl-review.md:101-109`) | 75d209b | `try/catch` w 15/15 endpointach czytających ciało | brak (smoke nie wysyła takiego ciała) |
| join-group-by-invite-link F2: nieudane dołączenie po rejestracji ląduje cicho na `/dashboard` (`…/reviews/impl-review.md:67-78`) | 51db0af | `joinRedirect` → `/join/<token>` (`invites.ts:53-57`); strona join nie czyta `?error` | brak dla gałęzi `error`; smoke ma `invalid` (`smoke.mjs:518`) |
| child-attendance-declaration F6: strona planu → 500 przy błędzie zapytania o grupę/termin (`…/reviews/impl-review.md:85-93`) | ACCEPTED, nie poprawiano | nadal: `terminy/[eventId].astro:42,46`; to samo `groups/[id].astro:44,99`, `statystyki.astro:22` | brak; nieosiągalne ze smoke |

Ocena historycznych twierdzeń: F1, F1 (generator) i F6 (signup) są **nieaktualne co do
zachowania** (poprawione), ale **aktualne co do braku testu**. F2 (join) jest **częściowo
aktualne**: cel przekierowania jest poprawiony, ale użytkownik nadal nie widzi komunikatu
o porażce. F6 (plan) jest **aktualne**, decyzja ACCEPTED nadal obowiązuje.

### E. Smoke: co jest i jak się wpinać

- Rejestr: tablice kroków `[nazwa, fn, oczekiwanie]` `readonlySteps` (`smoke.mjs:44`) i
  `writeSteps` (`:218`). Runner (`:643-675`) obsługuje `status`, `location` (prefiks),
  `locationExact`, `contains` (lista), `notContains` (jeden string).
- `request()` (`:24-38`) wysyła cookie, `Origin`, formularz urlencoded i `redirect: "manual"`.
  Nie ma opcji surowego ciała (JSON/puste). Dodanie tego to mała zmiana w helperze.
- Zwykły zalogowany użytkownik istnieje w krokach 243-248 (zalogowanie, potem GET
  `/admin/groups` → 404 na **stronie**, `:248`). Krok F9 (POST na **API**) pasuje tuż po `:248`
  i musi wysłać poprawny formularz (nazwa + istniejący e-mail), żeby przejść zod i dojść do RPC.
  Inaczej dostanie `invalid_input` i nie dotknie gałęzi `forbidden`.
- Brak weryfikacji stanu bazy: smoke nie ma zależności ani klucza service-role. Stan sprawdza
  się tylko przez renderowaną stronę (`contains`/`notContains`, np. `:301,372,444,505`). Dla F9
  „nic nie powstało” da się sprawdzić tak: późniejszy krok admina na `/admin/groups` z
  `notContains` unikalnej nazwy próbnej.
- Słabe asercje (antywzorzec „302 = sukces”): prefiks `/` przy `signout`
  (`:236,249,275,289,306,317,398,538,627,636`), prefiks `/dashboard` przy logowaniu/rejestracji
  (`:226,244,253,279,298,401,541,631`), kody nieasertowane w `:221` (`?error=`) i `:239`.
  Wcześniejszy precedens naprawy: event-plan-ui F1 wprowadził `locationExact`
  (`context/archive/2026-11-17-event-plan-ui/reviews/impl-review.md:29-37`).
- CI uruchamia smoke na `npm run preview` (build produkcyjny) przeciw lokalnemu Supabase z
  seedem (`ci.yml:28-60`). Admin `admin@example.com` pochodzi z `supabase/seed.sql`.

### F. Zachowania „sukcesu” zgodne z projektem (nie defekty)

- Wycofanie kierowcy, gdy usunięto 0 wierszy na nadchodzącym terminie → przekierowanie jak
  sukces (`driver.ts:88-93`). Komentarz: „a double click or a stale page”. Operacja jest
  idempotentna, więc to nie pozorny sukces.
- Udana deklaracja obecności → goły URL planu bez `?message` (`attendance.ts:60-62`). Smoke
  sprawdza ją `locationExact` + treścią strony (`smoke.mjs:549-557`).
- `join.ts:27-28` (klient nieskonfigurowany) → `/dashboard` bez błędu. Gałąź jest
  praktycznie nieosiągalna: bez klienta middleware nie ustawi `user`, więc `join.ts:22-24`
  przekieruje wcześniej do logowania. Niski priorytet.

### G. Strony przy błędzie zapytania

Odczyty pomocnicze są owinięte w `try/catch` i degradują sekcję (`groups/[id].astro:73-93`,
`terminy/[eventId].astro:70-84`, `dashboard.astro:19-25`, `statystyki.astro:31-38`,
`join/[token].astro:16-31` → 503). Odczyty główne (`getGroupWithAdmins`, `getGroupEvent`,
`getGroupInviteToken`) rzucają bez obsługi, co daje 500 (decyzja ACCEPTED, sekcja D). 500
strony przy awarii bazy to jawny błąd, nie pozorny sukces, więc nie łamie ryzyka #5 w jego
sformułowaniu. Smoke i tak nie potrafi tego wywołać.

## Weryfikacja guidance z §2 (ryzyko #5)

| Element guidance (`test-plan.md:27`) | Werdykt | Uzasadnienie |
|---|---|---|
| „jawny komunikat błędu (4xx lub przekierowanie z błędem), nigdy 500 ani sukces” | **potwierdzone, doprecyzować** | Dla odmowy uprawnień kontraktem jest 404 przez `rewrite` (sekcja A), a dla błędu pola: 302 z kodem z białej listy. Test musi asertować konkretny kod, nie samo `?error=` |
| Must challenge: „końcowe 302 = sukces” | **potwierdzone** | Prefiksowe `location` w smoke (sekcja E) |
| Context: mapowanie RPC, zod na granicy, strony przy błędzie | **potwierdzone** | Sekcje A, C, G |
| Najtańsza warstwa: unit (mapowanie, zod) + smoke | **potwierdzone z korektą** | Mapowanie i schematy → Vitest. Obsługa ciała, `rewrite` i kody HTTP żyją w handlerze Astro, poza czystymi funkcjami → smoke (bug B nie jest osiągalny unit-testem bez uruchamiania Astro) |
| Antywzorzec: mockowanie wnętrza klienta Supabase | **potwierdzone** | Czyste mappery istnieją. Prywatne `writeResult` wymagają decyzji (sekcja C) |
| Antywzorzec: sam kod statusu bez celu przekierowania i stanu danych | **potwierdzone** | Smoke nie widzi bazy, więc „stan danych” = sprawdzenie strony (`notContains`) |

Ocena dowodów hot-spot: `src/pages/api/` **trafny**, bo żywy błąd B jest w
`src/pages/api/admin/`. `src/lib/validation/` **częściowo trafny**: znane błędy granic są
poprawione (sekcja D), katalog pozostaje powierzchnią regresji, ale bez aktywnego defektu.

Żadne z wymienionych w ryzyku zagrożeń nie jest spekulatywne: B jest potwierdzony w runtime,
a luki w testach poprawek z sekcji D są faktyczne.

## Korekty do planu testów (kandydaci do backportu §2)

1. Risk Response Guidance #5, „What would prove protection”: dopisać, że odmowa uprawnień
   (42501) ma dać 404, a nie 500 ani przekierowanie z sukcesem, oraz że asercja sprawdza
   dokładny kod błędu z białej listy.
2. Source dla #5: oprócz cytowanych findingów nowy dowód: smoke-gap F9 potwierdzony jako żywy
   500 (bez kotwicy pliku w §2, zgodnie z zasadą #3; kotwice są w tym dokumencie).

## Code References

- `src/pages/api/admin/groups.ts:10,33`: ciało bez `clone()` + `rewrite("/404")` → 500
- `src/pages/api/admin/groups/admins.ts:10,33`: to samo
- `node_modules/astro/dist/core/routing/rewrite.js:123-126`: `RewriteWithBodyUsed`
- `src/pages/api/groups/invite.ts:15-16`: wzorzec poprawny (`clone()`)
- `src/middleware.ts:5`: `PROTECTED_ROUTES` nie obejmuje `/api/admin`
- `supabase/migrations/20261110120000_create_groups.sql:154-155`: 42501 dla nie-admina
- `src/lib/services/group-errors.ts:82-130`: mappery RPC i komunikaty
- `src/lib/services/auth-errors.ts:29-64`: mappery auth
- `src/lib/services/invites.ts:25-58`: `joinByInvite`, `joinRedirect`
- `src/lib/services/children.ts:25-33`, `src/lib/services/events.ts:30-38`: prywatne `writeResult`
- `src/lib/services/attendance.ts:59-64`, `src/lib/services/drivers.ts:64-69`: mapowanie w funkcjach z klientem
- `src/lib/validation/events.ts:18,30-35,98-107,112-176`: granice dat, marża startu, mappery pól
- `src/lib/time.ts:52-73`: `warsawLocalToUtc` (granice lat)
- `src/lib/weekly-events.ts:29-34`: strażnik zakresu serii
- `scripts/smoke.mjs:24-38,44,218,248,643-675`: helper, rejestry, miejsce na F9, runner
- `.github/workflows/ci.yml:28-60`: jak CI uruchamia smoke (preview, tylko anon key)
- `vitest.config.ts:1-13`: `environment: node`, `include: src/**/*.test.ts`

## Architecture Insights

- Autoryzacja jest w bazie (RLS/RPC). Endpoint tylko tłumaczy kody Postgresa na HTTP. Ryzyko
  #5 dotyczy więc tej warstwy tłumaczenia, a nie samych uprawnień (te pokrywa pgTAP, faza 3).
- 404 dla „brak prawa” jest celowe („does not advertise itself”, `group-errors.ts:85`).
- Konwencja `clone()` przed `rewrite` jest udokumentowana tylko w komentarzach. Nic jej nie
  egzekwuje, dlatego dryfuje (`invite.ts` raz, admin teraz). Test smoke na ścieżce 404 każdego
  endpointu z `rewrite` jest jedynym tanim strażnikiem. Alternatywą jest reguła lint.

## Historical Context (from prior changes)

- `context/archive/2026-11-10-app-admin-creates-group/follow-ups/review-fixes.md:10`: F9 (smoke dla nie-admina), nigdy nie zrealizowany
- `context/archive/2026-11-12-parent-adds-child/reviews/impl-review.md:82-93`: F3, ten sam błąd w `invite.ts`, poprawiony
- `context/archive/2026-11-17-event-plan-ui/reviews/impl-review.md:29-37`: F1, prefiks smoke przepuszczał `?error=unknown`; wprowadzono `locationExact`
- `context/archive/2026-11-12-group-admin-manages-events/reviews/impl-review.md:28-36`: F1, granice lat
- `context/archive/2026-11-13-weekly-event-generator/reviews/impl-review.md:28-40`: F1, obejście limitu 366 dni
- `context/archive/2026-11-09-signup-with-profile/reviews/impl-review.md:101-109`: F6, nie-formularzowe ciało
- `context/archive/2026-11-12-join-group-by-invite-link/reviews/impl-review.md:67-78`: F2, cicha porażka dołączenia
- `context/archive/2026-11-13-child-attendance-declaration/reviews/impl-review.md:85-93`: F6, 500 strony planu (ACCEPTED)

## Related Research

- `context/archive/2026-11-18-testing-rls-isolation-matrix/research.md`: warstwa bazy dla odmów 42501

## Open Questions

1. **Zakres poprawki kodu w tej zmianie.** Faza jest testowa, ale F9 będzie czerwony. Proponowane:
   test smoke najpierw (czerwony), potem poprawka `clone()` w 2 plikach admina, potem zielony.
   Dotyka to kodu produkcyjnego, więc decyzja należy do planu i użytkownika.
2. **Prywatne `writeResult` i mapowanie w `attendance`/`drivers`**: wyeksportować do testów
   jednostkowych czy zostawić pokrycie smoke'owi? (Mockowania klienta unikamy.)
3. **Cicha porażka dołączenia** (`joinRedirect` → `/join/<token>` bez komunikatu): pozostaje
   decyzją produktową. Test może przypiąć obecny cel przekierowania, ale „brak komunikatu” nie
   jest defektem wobec PRD bez decyzji.
4. **Strażnik konwencji `clone()`**: reguła lint/grep w `npm run lint` czy wystarczy smoke na
   każdej gałęzi 404? Dotyczy fazy 5 (bramki jakości).
