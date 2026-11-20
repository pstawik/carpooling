---
date: 2026-11-20T09:45:30+01:00
researcher: Piotr S (z Claude Code)
git_commit: abd1a0195e0bd036f5a7d23bcca536c4921302f4
branch: main
repository: carpooling
topic: "Drobne poprawki observability (krok 5 planu napraw: P-2, G-8)"
tags: [research, observability, supabase-client, config, invites, join]
status: complete
last_updated: 2026-11-20
last_updated_by: Piotr S (z Claude Code)
---

# Research: drobne poprawki observability (P-2, G-8)

**Date**: 2026-11-20T09:45:30+01:00
**Researcher**: Piotr S (z Claude Code)
**Git Commit**: abd1a0195e0bd036f5a7d23bcca536c4921302f4
**Branch**: main
**Repository**: carpooling

## Research Question

`change.md` nie ma notatek. Pytanie wynika z kroku 5 planu napraw
(`context/audits/observability/2026-11-19_groups-fix-plan.md:19,69-74`):

- **P-2:** `createClient` zwraca `null`, gdy brakuje sekretów Supabase. Ma powstać jeden log na
  isolate, a w produkcji trzeba rozważyć rzucenie błędu.
- **G-8:** nieudane dołączenie przez zaproszenie ma dodać `?error=unknown` i pokazać komunikat
  na `/join/[token]`.

P-3, trzeci punkt z listy w audycie (`2026-11-19_groups.md:141`), plan napraw przypisał do
kroku 3 (`fix-plan.md:17`). Został zamknięty w `service-error-cause` (#85), więc nie wchodzi
w zakres. Research ustala:

1. Co dziś dzieje się przy braku sekretów i które ścieżki faktycznie dochodzą do gałęzi
   `not_configured`.
2. Gdzie i jak wstawić log „raz na isolate” w obecnym helperze logów.
3. Co by zmieniło rzucanie błędu w produkcji.
4. Którędy przechodzi nieudany join, kto woła `joinRedirect` i co musi się zmienić na stronie
   `/join/[token]` oraz w teście.

## Summary

- **P-2.** `createClient` (`src/lib/supabase.ts:5-8`) zwraca `null` bez logu. Middleware woła go
  przy każdym żądaniu (`src/middleware.ts:26`). Przy `null` pomija `getUser()` (`:32`), więc
  `user = null` i chronione trasy przekierowują na `/auth/signin` (`:79-81`). Użytkownik nie
  zostaje jednak bez sygnału. `Layout.astro:22-34` pokazuje czerwony baner „Supabase nie jest
  skonfigurowany” na każdej stronie z `<Layout>` (`src/lib/config-status.ts:14-15,21`), a
  `signin.ts`/`signup.ts` dają `?error=not_configured`. Brakuje tylko logu. Audyt („no log
  anywhere”) ma tu rację, ale pomija baner.
- 11 endpointów w `src/pages/api` sprawdza `if (!context.locals.user)` przed `createClient`.
  Przy brakującym configu `user` jest zawsze `null`, bo middleware nie ma klienta, więc ich
  gałęzie `not_configured` (np. `attendance.ts:35-36`, `join.ts:27-28`) są w tym stanie
  **nieosiągalne**. Wniosek z kolejności kodu, niesprawdzony w runtime.
- Log „raz na isolate” najprościej dodać jako flagę modułową w `src/lib/supabase.ts`, emitowaną
  przez `emitLog` z `src/lib/error-log.ts:67-70`. `ErrorLogEvent` (`error-log.ts:1`) nie ma
  wartości dla braku konfiguracji, więc trzeba dodać nową (np. `config_missing`).
- Rzucanie w produkcji ma duży zasięg. Middleware woła `createClient` przy **każdym** żądaniu,
  także na `/` i `/auth/*`, i nie ma try/catch, więc throw dałby Astro 500 na całej aplikacji,
  łącznie ze stroną główną. Baner i komunikat `not_configured` zniknęłyby w produkcji. Zostawiam
  to jako decyzję produktową na `/10x-plan` (patrz Open Questions).
- **G-8.** `joinRedirect` (`src/lib/services/invites.ts:51-62`) wysyła `error` na gołe
  `/join/${token}`. Strona (`src/pages/join/[token].astro`) nie czyta żadnego query, więc
  zalogowany użytkownik widzi ten sam formularz „Dołącz do grupy” bez komunikatu. `joinRedirect`
  ma 3 wywołania: `api/groups/join.ts:31`, `api/auth/signin.ts:42`, `api/auth/signup.ts:48`.
  Zmiana w jednym miejscu obejmuje więc też join po rejestracji i logowaniu.
- Test `src/lib/services/invites.test.ts:26-28` asertuje dziś `error` → `/join/${TOKEN}` „no
  message”. Zmiana na `?error=unknown` to celowa zmiana zachowania. Test trzeba zaktualizować
  świadomie w planie, nie dopasowywać po fakcie. Intencja oracle F2 („nigdy na stronę wyglądającą
  na sukces”, `invites.test.ts:9-10`) pozostaje spełniona.

## Detailed Findings

### P-2: brak sekretów Supabase

**Schemat env.** Oba sekrety są opcjonalne: `envField.string({ context: "server", access:
"secret", optional: true })` (`astro.config.mjs:22-23`). Ich brak nie wywala buildu ani
startu, tylko daje `undefined` w runtime.

**`createClient`.** `src/lib/supabase.ts:5-8` zwraca `null`, gdy brakuje któregokolwiek z
`SUPABASE_URL` / `SUPABASE_KEY`, i niczego nie loguje. Grep znalazł 23 pliki z wywołaniem
`createClient(` (middleware, 6 stron, 16 endpointów; grep `createClient\|not_configured` w `src`).

**Middleware.** `createClient` przy każdym żądaniu (`src/middleware.ts:26`). Cała logika auth,
profilu i `is_app_admin` siedzi w `if (supabase)` (`:32-77`). Przy `null` zostaje
`locals.user = null` (`:28`), a `/dashboard`, `/admin`, `/groups*` przekierowują na
`/auth/signin` (`:7,79-81`).

**Co widzi użytkownik przy braku configu** (obserwowane w kodzie):

| Miejsce | Zachowanie | Źródło |
|---|---|---|
| Każda strona z `<Layout>` | Baner `variant="error"`: „Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.” | `src/layouts/Layout.astro:4,22-34`, `src/lib/config-status.ts:11-21` |
| `/dashboard`, `/admin`, `/groups/*` | 302 → `/auth/signin` | `src/middleware.ts:79-81` |
| `POST /api/auth/signin`, `/signup` | 302 → `?error=not_configured` | `signin.ts:29-31`, `signup.ts:29-31` |
| `POST /api/auth/signout` | Po cichu 302 → `/` | `signout.ts:5-9` |
| `GET /join/<token>` | `token && supabase` fałszywe, więc `groupName = null` → **404 „Link nieaktualny”** | `src/pages/join/[token].astro:14-17,29-30,56-59` |
| 11 endpointów z guardem `locals.user` | Guard odpala przed `createClient`, więc gałąź `not_configured` nie jest osiągana | np. `attendance.ts:14`, `join.ts:22-23` przed `:26-28` |

Wniosek: przy braku configu `/join/<token>` mówi „link nieaktualny” zamiast „błąd konfiguracji”.
To ten sam wzorzec mylącego sygnału, ale baner na górze strony go łagodzi. Audyt (wiersz P-2,
`2026-11-19_groups.md:123`) mówi „every join to `/dashboard`”. To zdanie jest **częściowo
nieaktualne**: `join.ts:27-28` faktycznie kieruje na `/dashboard`, ale przy braku configu tam
nie dochodzi, bo wcześniej przekierowuje guard `join.ts:22-23` na `/auth/signin?invite=…`.
Zdanie „bounces every signed-in page to sign-in” jest **trafne** (`middleware.ts:79-81`). Zdanie
„no log anywhere” jest **trafne** dla logów: grep `emitLog|logError|console` nie ma trafień w
`supabase.ts` ani `config-status.ts`.

**Helper logów.** `src/lib/error-log.ts` ma `emitLog(level, fields)` (`:67-70`), jedyne miejsce
w `src/`, które woła `console[level]` z polami logu. Do tego `logError(level, event, op, error,
context)` (`:73-81`). `ErrorLogEvent` (`:1`) to `"write_failed" | "section_degraded" |
"read_failed" | "unexpected_refusal" | "auth_failed"`, bez wartości dla brakującej konfiguracji.
Nazwy brakujących zmiennych są bezpieczne do zalogowania, wartości nie, bo to sekrety.
`ErrorLogFields` (`:12-18`) nie ma pola na listę brakujących nazw. Trzeba je dodać albo
przekazać przez `op`/`message`.

**Gdzie wstawić flagę „raz na isolate”.** Do wyboru są dwa miejsca:
- `src/lib/supabase.ts` to jedyne miejsce, gdzie `null` powstaje, i każde żądanie przez nie
  przechodzi (`middleware.ts:26`). Flaga modułowa `let warned = false` daje jeden wpis na
  isolate.
- `src/lib/config-status.ts:14` liczy `configured` na poziomie modułu. Kiedy na Cloudflare
  `astro:env/server` dostarcza sekrety przy ewaluacji modułu, nie zostało zweryfikowane. Log w
  `supabase.ts` przy pierwszym wywołaniu w żądaniu nie zależy od tej kolejności, więc jest
  bezpieczniejszy.

**Rzucanie w produkcji: skutki.**
- Middleware nie ma try/catch (`src/middleware.ts:25-86`). Throw z `createClient` przejdzie ścieżką
  Astro: stack w logu, 500 bez własnego `500.astro` (zweryfikowane w audycie,
  `2026-11-19_groups.md:57`).
- Dotyczy to **wszystkich** tras, łącznie z `/`, `/auth/*`, `/404`, `/503` i `/dev/*`, bo
  `onRequest` nie filtruje ścieżek przed `createClient`.
- `import.meta.env.PROD` jest prawdziwe też dla `npm run build && npm run preview`, czyli dla
  smoke'a i E2E (`playwright.config.ts:36`). CI zapisuje sekrety do `.env`/`.dev.vars` przed
  buildem w jobie smoke (`.github/workflows/ci.yml:49-53`), więc te ścieżki działają. Lokalny
  preview bez `.dev.vars` dawałby jednak 500 zamiast banera.
- Baner `missingConfigs` i komunikaty `not_configured` stałyby się w produkcji martwym kodem
  (dev nadal by z nich korzystał).
- Wariant pośredni: zamiast throw w produkcji zwracać 503 z middleware dla `/api/*` i tras
  chronionych, tak jak przy awarii Auth (`middleware.ts:44-52`). Nie zostało to sprawdzone pod
  kątem UX, to tylko opcja do rozważenia w planie.

### G-8: nieudany join przez zaproszenie

**Przepływ.** Formularz `POST /api/groups/join` (`src/pages/join/[token].astro:68-73`) →
`join.ts:31` → `joinByInvite` (`invites.ts:31-48`). Błąd RPC inny niż `invalid_invite` albo brak
wiersza: `logError("error", "write_failed", "join_group_by_invite", …, { userId })`
(`invites.ts:39,44`), wynik `{ kind: "error" }`. `joinRedirect` (`:51-62`) dla `"invalid"` i
`"error"` zwraca `/join/${token}` bez query.

**Strona po powrocie.** `[token].astro` nie czyta `Astro.url.searchParams`. Dla poprawnego tokenu
i zalogowanego użytkownika renderuje ten sam nagłówek i formularz „Dołącz do grupy”
(`:64-73`). Failure jest zalogowany, ale użytkownik nie widzi różnicy. To pokrywa się z opisem
G-8 (`2026-11-19_groups.md:116`).

**Wywołania `joinRedirect`** (grep `joinByInvite|joinRedirect` w `src`, bez testów, 3 trafienia):
- `src/pages/api/groups/join.ts:31`: przycisk „Dołącz do grupy”.
- `src/pages/api/auth/signin.ts:42`: logowanie z `?invite=`.
- `src/pages/api/auth/signup.ts:48`: rejestracja z sesją i `?invite=`.

Zmiana wyniku `error` → `/join/${token}?error=unknown` obejmuje więc też join po logowaniu i
rejestracji. To pożądane, bo w tych ścieżkach użytkownik też trafia na `/join/<token>` bez sygnału.

**`invalid` nie potrzebuje zmiany.** Po powrocie `getInviteGroupName` zwraca `null` dla
nieznanego lub zregenerowanego tokenu, więc strona sama pokazuje 404 „Link nieaktualny”
(`[token].astro:29-30,56-59`).

**Komunikat.** Słownik `group-errors.ts` ma `unknown: "Coś poszło nie tak, spróbuj ponownie"`
(`src/lib/services/group-errors.ts:30`) i regułę „redirecty niosą tylko kody, nigdy wolny
tekst” (`:7`). Strona powinna więc rozpoznawać tylko `error === "unknown"` (whitelist), a nie
echo parametru. Ten sam wzorzec stosuje `terminy/[eventId].astro:63` (`errorCode ===
"not_configured" || errorCode === "unknown" ? groupErrorMessage(errorCode, null) : null`).

**Gdzie pokazać komunikat.** Tylko w gałęzi poprawnego tokenu (`[token].astro:64-86`), nad
formularzem, żeby został przycisk ponowienia. Gałęzie `lookupFailed` (503) i „nieaktualny”
(404) mają pierwszeństwo, bo token mógł zostać zregenerowany między próbami.

**UI.** `src/components/ui/alert.tsx` istnieje i jest używany z `variant="destructive"
role="alert"` (np. `src/pages/groups/[id].astro:116`). `[token].astro` **nie** jest na liście
`CLEANED_VIEWS` (`scripts/check-ui-literals.mjs:10-34`) i używa klas palety
(`[token].astro:33-40`: `bg-purple-600`, `text-white`, `from-blue-200`). Lint literałów tego
pliku nie sprawdza. Reguła AGENTS.md o tokenach dotyczy jednak widoków ogólnie, więc nowy
komunikat powinien użyć `<Alert>` z tokenami, a nie powielać klas palety. Pełne sprzątanie
widoku to osobna zmiana (`/10x-ui`), nie ten krok.

**Test.** `src/lib/services/invites.test.ts:26-28` ma tytuł `"error -> back to /join/<token>, no
message (F2: not /dashboard)"` i oczekuje `/join/${TOKEN}`. Po zmianie oczekiwanie to
`/join/${TOKEN}?error=unknown`. Test dla `invalid` (`:22-24`) zostaje bez zmian. Token jest
url-safe base64 (`invites.test.ts:6`), więc doklejenie `?error=unknown` nie wymaga kodowania.

## Code References

- `astro.config.mjs:22-23`: `SUPABASE_URL`/`SUPABASE_KEY` jako opcjonalne sekrety serwera
- `src/lib/supabase.ts:5-8`: `createClient` zwraca `null` bez logu
- `src/middleware.ts:26,32-77,79-81`: klient przy każdym żądaniu, `if (supabase)`, redirect na signin
- `src/middleware.ts:44-52`: wzorzec 503 dla `/api/*` i tras chronionych (awaria Auth)
- `src/lib/config-status.ts:11-21`, `src/layouts/Layout.astro:22-34`: baner o braku konfiguracji
- `src/lib/error-log.ts:1,12-18,67-81`: `ErrorLogEvent`, `ErrorLogFields`, `emitLog`, `logError`
- `src/pages/api/groups/join.ts:22-31`: guard usera, `not_configured` → `/dashboard`, `joinRedirect`
- `src/pages/api/auth/signin.ts:42`, `src/pages/api/auth/signup.ts:48`: pozostałe wywołania `joinRedirect`
- `src/lib/services/invites.ts:31-62`: `joinByInvite` (log `write_failed`), `joinRedirect`
- `src/pages/join/[token].astro:11-31,64-86`: lookup, statusy 503/404, gałąź formularza
- `src/lib/services/group-errors.ts:7,30`: reguła „tylko kody” i komunikat `unknown`
- `src/pages/groups/[id]/terminy/[eventId].astro:63`: wzorzec whitelisty `?error=`
- `src/lib/services/invites.test.ts:9-10,22-28`: oracle F2 i testy `joinRedirect`
- `scripts/check-ui-literals.mjs:10-34`: `CLEANED_VIEWS` (bez `join/[token].astro`)

## Architecture Insights

- Logi idą wyłącznie przez `emitLog`/`logError` jako jeden obiekt na linię, ze stałym polem
  `event` (wynik `structured-error-logs`). Nowy wpis o braku konfiguracji powinien trzymać się
  tego kontraktu i dodać wartość do unii `ErrorLogEvent`, zamiast wołać `console.*` bezpośrednio.
- Redirecty niosą kody z whitelisty, nie tekst (`group-errors.ts:7`, `auth-errors.ts:5`).
  `?error=unknown` na `/join` wpisuje się w ten wzorzec.
- Middleware nie ma globalnego try/catch. Błąd tam rzucony daje 500 na każdej trasie. To
  najważniejsze ograniczenie wariantu „throw w produkcji”.

## Historical Context (from prior changes)

- `context/archive/2026-11-12-join-group-by-invite-link/reviews/impl-review.md:67-80` (F2):
  `error` celowo przeniesiono z `/dashboard` na `/join/<token>`, żeby użytkownik mógł ponowić.
  Ten sam wpis odnotowuje, że gałąź `join.ts` dla braku klienta „still goes to `/dashboard`”.
  Werdykt: oba zdania **trafne** dla obecnego kodu (`invites.ts:58-60`, `join.ts:27-28`). G-8
  dokłada do decyzji F2 brakujący komunikat i jej nie odwraca.
- Ta sama recenzja, F1 (`impl-review.md:54-65`): wprowadziła 503 „Coś poszło nie tak” na
  `/join/<token>` przy błędzie lookupu (`[token].astro:20-28,46-55`). Wzorzec komunikatu jest
  już na tej stronie.
- `context/audits/observability/2026-11-19_groups-fix-plan.md:15-19`: kroki 1–4 zakończone
  (#80/#81, #82, #85, #88), krok 5 „do zrobienia”.

## Related Research

- `context/archive/2026-11-20-structured-error-logs/research.md`: helper `logError`, pole `event`

## Open Questions

1. **P-2, produkcja: throw, 503 czy tylko log?** Throw daje 500 na każdej trasie, łącznie ze
   stroną główną, i wyłącza baner. 503 z middleware tylko dla `/api/*` i tras chronionych
   powtarza wzorzec awarii Auth. Sam log (raz na isolate) plus istniejący baner to wariant
   minimalny. To decyzja produktowa dla `/10x-plan`.
2. **P-2: poziom i nazwa eventu.** `error` czy `warn`? Na przykład `config_missing` z listą
   brakujących **nazw** zmiennych (bez wartości). Wymaga rozszerzenia `ErrorLogEvent` i
   prawdopodobnie `ErrorLogFields`.
3. **P-2: czy poprawić `/join/<token>` przy braku configu**, gdzie dziś wyświetla się 404 „Link
   nieaktualny”? Poza literą kroku 5, ale to ten sam mylący sygnał.
4. **Niezweryfikowane:** moment, w którym na Cloudflare `astro:env/server` udostępnia sekrety
   (przy ewaluacji modułu czy per request). Ma znaczenie tylko wtedy, gdy log miałby siedzieć
   w `config-status.ts` na poziomie modułu. W `supabase.ts` przy wywołaniu nie ma znaczenia.
5. **G-8: status HTTP** strony `/join/<token>?error=unknown`: 200 czy np. 503? Obecny wzorzec
   formularzy (PRG) zostawia 200 z komunikatem.
