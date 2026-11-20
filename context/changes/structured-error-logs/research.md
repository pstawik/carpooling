---
date: 2026-11-20T08:41:05+01:00
researcher: Piotr S (z Claude Code)
git_commit: 94d4c881cec93f40851b06aaa7b28a0ef75cddca
branch: main
repository: carpooling
topic: "Strukturalne logi błędów (krok 4 planu napraw observability: G-6, G-3, G-7)"
tags: [research, observability, logging, middleware, api, services, cloudflare-workers-logs]
status: complete
last_updated: 2026-11-20
last_updated_by: Piotr S (z Claude Code)
---

# Research: strukturalne logi błędów

**Date**: 2026-11-20T08:41:05+01:00
**Researcher**: Piotr S (z Claude Code)
**Git Commit**: 94d4c881cec93f40851b06aaa7b28a0ef75cddca
**Branch**: main
**Repository**: carpooling

## Research Question

`change.md` nie ma notatek. Pytanie wynika z kroku 4 planu napraw
(`context/audits/observability/2026-11-19_groups-fix-plan.md:60-67`). Jeden helper
`logError({ op, event, groupId, eventId, userId, error })` ma wypisywać JSON ze stałym polem
`event` (`write_failed`, `section_degraded`, `unexpected_refusal`). Trzeba go podpiąć we
wszystkich miejscach `console.error` i rozstrzygnąć, czy gałąź `unknown` przy zapisie zmienia
status (500/503) zamiast 302. Research ustala:

1. pełną listę miejsc logowania, ich dane wejściowe i identyfikatory w zasięgu;
2. format logu, który Workers Logs indeksuje jako pola;
3. przyjęte już ograniczenia PII;
4. fakty potrzebne do decyzji o statusie gałęzi `unknown`.

## Summary

1. **Miejsc jest 28, nie 26.** `grep "console\." src` poza testami daje 27 `console.error`
   i 1 `console.warn` (`middleware.ts:41`). Do tego dochodzi `console[level]` w
   `src/lib/refusal-log.ts:46`. Liczba „26” w audycie się zdezaktualizowała. Pełna tabela jest
   w „Detailed Findings → A”.
2. **Kategorie z planu nie pokrywają wszystkiego.** Z 28 miejsc:
   - 15 to `write_failed`: 13 gałęzi `unknown` w trasach zapisu oraz 2 w `joinByInvite`;
   - 7 to `section_degraded`: 4 strony grup, dashboard, `admin/groups.astro` i profil w
     middleware;
   - 4 to odczyty, które nie pasują do żadnej kategorii: `getGroupEvent` po odmowie zapisu (×2),
     `is_app_admin` i strona zaproszenia;
   - 2 to błędy Auth w middleware (`middleware.ts:41,44`), które już mają własny whitelistowany
     kształt (`authErrorLogFields`).

   Planowi brakuje więc co najmniej kategorii dla odczytu (np. `read_failed`) i dla Auth.
3. **Format: obiekt jako jedyny argument.** Cloudflare opisuje
   `console.log({ user_id: 123 })` jako formę, z której Workers Logs „automatycznie wyciąga pola
   i je indeksuje”
   ([workers-logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)).
   Formy `"prefix:", obj` (dziś `refusal-log.ts:46` i `middleware.ts:41,44`) oraz
   `JSON.stringify(obj)` nie są opisane. Indeksowanie drugiego argumentu jest niepotwierdzone.
4. **Obiekt `Error` nie może trafić do JSON surowo.** `message`, `stack` i `cause` są
   nieenumerowalne. Helper musi więc kopiować pola jawnie. To, jak produkcyjne Workers Logs
   serializują `Error` zagnieżdżony w obiekcie, jest niezweryfikowane: istnieje tylko dowód z
   lokalnego workerd dla `console.error(err)` na najwyższym poziomie
   (`context/archive/2026-11-20-service-error-cause/plan.md:179`).
5. **PII: obowiązuje whitelist i jest jeden konflikt.**
   - `refusal-log.ts:21-24` i `auth-error.ts:36-46` kopiują tylko nazwane pola.
   - Zakazane są `details`, `hint`, tokeny, e-maile i imiona
     (`context/archive/2026-11-20-log-unexpected-refusals/plan.md:50-51`).
   - `serviceError` (`src/lib/service-error.ts:8`) celowo trzyma cały błąd PostgREST w `cause`.
     Uwaga F3 z przeglądu (`…/service-error-cause/reviews/impl-review.md:48-56`, PENDING) każe
     ten konflikt rozstrzygnąć w tym kroku.
6. **Status gałęzi `unknown`: dziś obowiązuje kontrakt „302, nigdy 500”.**
   - Kontrakt jest zapisany w `context/foundation/test-plan.md:234-239`.
   - Wszystkie formularze to natywne `<form method="POST">`, a w `src/components` nie ma
     `fetch`. Status 5xx nie zepsułby więc JS, ale zostawiłby użytkownika na URL `/api/...`, gdzie
     odświeżenie ponawia POST.
   - Żaden test nie sprawdza gałęzi `unknown` na poziomie endpointu (`test-plan.md:252-254`).
   - Zmiana statusu to decyzja produktowa. Wymaga ona zmiany kontraktu w test-plan.

## Detailed Findings

### A. Mapa miejsc logowania

Wszystkie miejsca mają `// eslint-disable-next-line no-console`, bo `eslint.config.js:25` ustawia
`no-console: "warn"`.

| # | Miejsce | Dziś loguje | Wartość błędu | Id w zasięgu | Co dostaje użytkownik | Kategoria |
|---|---|---|---|---|---|---|
| 1 | `src/lib/services/invites.ts:37` | `code, message` | PostgREST (rpc) | brak; tylko `token`, którego nie wolno logować (`:35`) | 302 na `/join/{token}` bez kodu błędu (`:57-59`, G-8) | write_failed (trzeba przekazać id albo przenieść log do wywołujących) |
| 2 | `invites.ts:43` | sam tekst | brak (złamany niezmiennik) | brak | jak #1 | write_failed / inna |
| 3 | `src/middleware.ts:41` (warn) | `"auth session rejected:", authErrorLogFields` | AuthError | brak id, tylko `path` | traktowany jak wylogowany | auth |
| 4 | `middleware.ts:44` | `"auth getUser failed:", authErrorLogFields` | AuthError (awaria) | brak id, tylko `path` | 503 dla `/api/*` (`:47-48`), `next("/503")` dla stron chronionych (`:50-52`) | auth |
| 5 | `middleware.ts:66` | `code, message` | PostgREST (profiles) | `user.id` | `profile = null`, zostaje fallback na e-mail | section_degraded |
| 6 | `middleware.ts:76` | `code, message` | PostgREST (rpc) | `user.id` | `isAppAdmin = false`, czyli bezgłośne zamknięcie dostępu | read_failed |
| 7 | `src/pages/admin/groups.astro:32` | `code, message` | PostgREST (rpc) | `Astro.locals.user.id` | 200 z banerem `unknown` i pustą listą | section_degraded |
| 8 | `src/pages/api/admin/groups/admins.ts:42` | `code, message` | PostgREST (rpc) | `user.id`, `group_id`; nie logować `email` | 302 `adminGroupsErrorUrl("unknown")` | write_failed |
| 9 | `src/pages/api/admin/groups.ts:42` | `code, message` | PostgREST (rpc) | `user.id`; nie logować `admin_emails` | 302 `/admin/groups?error=unknown` | write_failed |
| 10 | `src/pages/api/groups/children/delete.ts:43` | `outcome.error?.code/message` | `PostgrestError` | `user.id`, `groupId`, `childId` | 302 `?error=unknown` | write_failed |
| 11 | `children/update.ts:46` | jak wyżej | jak wyżej | `user.id`, `groupId`, `childId` | 302 | write_failed |
| 12 | `src/pages/api/groups/children.ts:48` | jak wyżej | jak wyżej | `user.id`, `groupId` | 302 | write_failed |
| 13 | `events/attendance.ts:51` | `"getGroupEvent failed:", err` | `Error` z `serviceError` z `cause` | `refusalIds` (`:31`): user, group, event, child | 302 `?error=unknown` | read_failed (odczyt po odmowie zapisu) |
| 14 | `events/attendance.ts:63` | `outcome.error?.code/message` | `PostgrestError` | `refusalIds` | 302 | write_failed |
| 15 | `events/delete.ts:42` | jak #10 | jak #10 | user, group, event | 302 | write_failed |
| 16 | `events/driver.ts:61` | jak #10 | jak #10 | user, group, event | 302 | write_failed |
| 17 | `events/driver.ts:72` | `outcome.error.code/message` | `PostgrestError` (wymagany) | user, group, event | 302 | write_failed |
| 18 | `events/driver.ts:85` | `"getGroupEvent failed:", err` | `Error` z `cause` | user, group, event (`refusalIds` powstaje dopiero w `:88`) | 302 | read_failed |
| 19 | `events/generate.ts:51` | `outcome.failure, code, message` | `failure` + `PostgrestError` | user, group, `dates.length` | 302 | write_failed (zachować `failure`) |
| 20 | `events/update.ts:47` | jak #10 | jak #10 | user, group, event | 302 | write_failed |
| 21 | `src/pages/api/groups/events.ts:48` | jak #10 | jak #10 | user, group | 302 | write_failed |
| 22 | `src/pages/api/groups/invite.ts:41` | `code, message` | PostgREST (rpc) | user, group; nie logować nowego tokenu | 302 | write_failed |
| 23 | `src/pages/dashboard.astro:23` | `"listMyGroups failed:", err` | `Error` z `cause` | `user.id` | 200 z tekstem „Nie udało się wczytać grup…” (`:42-46`) | section_degraded |
| 24 | `src/pages/groups/[id]/statystyki.astro:40` | `console.error(loadError)` | `Error` z `cause` (stats.ts:57,74,77) | user, `group.id` | 200 z tekstem „Nie udało się wczytać statystyk.” | section_degraded |
| 25 | `groups/[id]/terminy/[eventId].astro:82` | jak #24 | `Error` (children.ts:43, attendance.ts:39, drivers.ts:41) | user, group, `event.id` | 200 z tekstem „Nie udało się wczytać planu.” | section_degraded |
| 26 | `src/pages/groups/[id].astro:77` | jak #24 | `Error` (events.ts:49) | user, group | 200 z tekstem „…terminów.” | section_degraded |
| 27 | `groups/[id].astro:91` | jak #24 | `Error` (children.ts:43) | user, group | 200 z tekstem „…dzieci.” | section_degraded |
| 28 | `src/pages/join/[token].astro:22` | `"invite page lookup failed:", err` | `Error` **bez** `cause`, celowo (`invites.ts:20-21`) | `user?.id` (strona publiczna); tokenu nie logować | 503 z tekstem „Nie udało się sprawdzić zaproszenia…” | read_failed |

Do tego dochodzi `logUnexpectedRefusal` (`src/lib/refusal-log.ts:44-47`), który ma 13 wywołań.
Część z nich to `groups.ts:100`, `children*.ts`, `attendance.ts:41,59`, `events*.ts`,
`driver.ts:91,99`, `generate.ts:42` i `invite.ts:37`. Ten helper już emituje
`{ event: "unexpected_refusal", op, code, message, userId, groupId?, eventId?, childId? }`, ale w
formie `"unexpected refusal:", obj`. Kształt ustalono celowo tak, żeby krok 4 go rozszerzył
(`context/archive/2026-11-20-log-unexpected-refusals/plan.md:56-58`).

Typy wyników serwisów:
- `ChildWriteResult` w `children.ts:16`;
- `EventWriteResult` w `events.ts:18`, a `EventGenerateResult` w `events.ts:113-115`;
- `AttendanceWriteResult` w `attendance.ts:8-9`;
- `DriverWriteResult` i `DriverWithdrawResult` w `drivers.ts:16-20`;
- `GroupRpcFailure` w `group-errors.ts:84-86`.

Wszystkie niosą opcjonalne `error: PostgrestError`, z wyjątkiem `DriverWithdrawResult`, gdzie
jest ono wymagane.

Poza zakresem listy, ale istotne dla pokrycia: niektóre wywołania nie mają `catch`, więc kończą
się 500 bez logu aplikacji. Należą do nich:
- `getGroupWithAdmins` w `statystyki.astro:22`, `[eventId].astro:42` i `[id].astro:44`;
- `getGroupEvent` w `[eventId].astro:46`;
- `getGroupInviteToken` w `[id].astro:99`.

Decyzję o przyjęciu 500 dla głównego zapytania strony zapisano w
`context/archive/2026-11-13-child-attendance-declaration/reviews/impl-review.md:85-94` (F6) i w
`test-plan.md:321`.

### B. Cloudflare Workers Logs

- Konfiguracja `wrangler.jsonc:21-23` to tylko `"observability": { "enabled": true }`. Nie ma
  `head_sampling_rate`, więc obowiązuje domyślne 100%. Nie ma też logpush ani source maps.
- Opisane są dwie formy:
  - pojedynczy obiekt jako argument daje pola do filtrowania;
  - string daje tylko tekst do wyszukiwania pełnotekstowego.

  Źródło:
  [workers-logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
- Tail handler dostaje `{ timestamp, level, message }`, gdzie `message` to tablica argumentów
  ([tail](https://developers.cloudflare.com/workers/runtime-apis/handlers/tail/)). Prefiks i obiekt
  to więc tablica dwuelementowa. Dokumentacja nie mówi, czy taki obiekt jest indeksowany.
- Nazwa pola poziomu w Query Builderze nie pada w przeczytanej dokumentacji. Przypuszczalnie to
  `$metadata.level`, ale jest to niepotwierdzone.
- Alerty:
  - na zapytaniach Workers Logs nie znaleziono w dokumentacji alertów;
  - najbliższe jest Issues (open beta, Wrangler ≥ 4.134.0), które grupuje logi na poziomie
    `error` lub zawierające obiekt `Error`/stack oraz 5xx i ma automatyzacje (webhook/czat)
    ([issues](https://developers.cloudflare.com/workers/observability/issues/));
  - dziś alertów brak (`context/audits/observability/2026-11-19_groups.md:37-38`).
- Limity: wpis ma maks. 256 KB, a retencja wynosi 7 dni.
- Logi można czytać przez `wrangler tail` i serwer MCP Cloudflare
  (`context/foundation/infrastructure.md:159-163`).

### C. Ograniczenia PII i bezpieczeństwa

- Whitelist pól z błędu:
  - `refusalLogFields` kopiuje tylko `code` i `message` (`refusal-log.ts:21-24`);
  - `authErrorLogFields` kopiuje `name`, `status`, `code`, `message` i `path`
    (`auth-error.ts:36-46`);
  - testy sprawdzają, że dodatkowe pola (`token`, `email`, `details`, `hint`) nie przechodzą
    (`src/lib/refusal-log.test.ts:7-39`, `src/lib/auth-error.test.ts:41-59`).
- Zakazane w logach (`log-unexpected-refusals/plan.md:50-51`;
  `middleware-auth-error-logging/plan.md:49`): imiona, pseudonimy, e-maile, tokeny zaproszeń,
  cookies, nagłówki, `details` i `hint`. Identyfikatory UUID nie są PII (audyt G-6,
  `2026-11-19_groups.md:114`).
- Konflikt F3: `serviceError` zachowuje cały błąd PostgREST jako `cause`
  (`service-error.ts:1-8`). Dziś `console.error(err)` w miejscach #13, #18 i #23–#27 wypisuje więc
  `cause.details` i `cause.hint`. Wyjątkiem jest `getInviteGroupName` (`invites.ts:20`), który
  celowo nie ma `cause`.

  Helper musi wybrać jedną z dwóch dróg:
  - kopiować z `cause` tylko `code` (i ewentualnie `message`), co jest spójne z whitelistą, ale
    traci `details`/`hint`, które krok 3 chciał zachować;
  - świadomie dopuścić `details`/`hint` dla odczytów.

### D. Status gałęzi `unknown` w trasach zapisu

- Każdy endpoint zwraca w tej gałęzi `context.redirect(url)` (302). Wspólny helper URL ma tylko
  admin: `adminGroupsErrorUrl` w `group-errors.ts:116-120`. Lista linii to tabela A, wiersze 8–22.
- Formularze:
  - wszystkie są natywnymi `<form method="POST">`, w stronach Astro i w wyspach `ChildItem.tsx`,
    `EventItem.tsx` i `InvitePanel.tsx`;
  - `onSubmit` wysp tylko anuluje wysyłkę po odrzuceniu dialogu potwierdzenia (np.
    `ChildItem.tsx:20-22`);
  - nikt po stronie klienta nie czyta statusu.
- Wyświetlanie: `?error=unknown` daje baner „Coś poszło nie tak, spróbuj ponownie”
  (`group-errors.ts:30`) na stronie grupy (`[id].astro:52-56,116-120`), na stronie planu
  (`[eventId].astro:58-62,106-109`) i w adminie (`admin/groups.astro:17,66-71`).
- Możliwości techniczne istnieją w repo:
  - `Astro.response.status` w `404.astro:5`, `503.astro:8` i `join/[token].astro:28,30`;
  - `context.rewrite("/404")` z POST, możliwy dzięki `request.clone()`;
  - `new Response(…, { status: 503 })` w middleware.

  Pułapka: link „Spróbuj ponownie” w `503.astro:13` buduje adres z `Astro.originPathname`. Po
  rewrite z trasy API wskazywałby więc na POST-only `/api/...`. Nie ma też `500.astro`.
- Kontrakt i testy:
  - `test-plan.md:234-239` (§6.4) mówi: „nieznany błąd bazy → `console.error` + 302
    `?error=unknown`; nigdy 500”; to samo powtarza ryzyko #5 (`:44,58`) i wiersz rolloutu (`:72`);
  - smoke (`scripts/smoke.mjs`, `redirect: "manual"`) nie wywołuje `unknown`
    (`test-plan.md:252-254`);
  - Vitest sprawdza tylko mapowanie na `unknown` w serwisach, np. `children.test.ts:44-53` i
    `group-errors.test.ts:49-62`.
- Wcześniejsze decyzje:
  - 302 dla `unknown` przyjęto w planach `2026-11-12-group-admin-manages-events/plan.md:162`,
    `2026-11-12-join-group-by-invite-link/plan.md:126`,
    `2026-11-13-child-attendance-declaration/plan.md:189` i
    `2026-11-13-driver-declaration-seat-balance/plan.md:190`;
  - 5xx wybrano wyłącznie dla renderu i awarii: strona zaproszenia 503 i awaria Auth 503
    (`2026-11-19-middleware-auth-error-logging/plan-brief.md:31-35`, z uzasadnieniem „status 5xx
    widać w logach”);
  - PRD nie wspomina o PRG, 302 ani 5xx.

## Code References

- `src/lib/refusal-log.ts:1-47`: kształt `unexpected_refusal`, whitelist i `console[level]` z
  prefiksem.
- `src/lib/auth-error.ts:28-46`: `authErrorLogFields`.
- `src/lib/service-error.ts:1-8`: `serviceError` z `cause`.
- `src/lib/services/invites.ts:20,35-43`: brak `cause` dla tokenu, log w serwisie bez id.
- `src/lib/services/group-errors.ts:30,57-79,84-96,116-120`: komunikaty, sekcje, klasyfikator RPC
  i URL admina.
- `src/middleware.ts:12-17,41-52,66,76`: logi Auth, 503 oraz profil i is_app_admin.
- `src/pages/503.astro:8-13`: status i link ponowienia.
- `eslint.config.js:25,73-78`: `no-console`.
- `wrangler.jsonc:21-23`: observability.
- `context/foundation/test-plan.md:81,232-262`: Vitest dla czystych funkcji i kontrakt odpowiedzi.

## Architecture Insights

- Przyjęty wzorzec: czysta funkcja `…LogFields(op, error, ids)` testowana w Vitest plus cienki
  wrapper z `console`. Pasuje on do `test-plan.md:81` (tylko czyste funkcje). Nowy helper może
  uogólnić `refusalLogFields` o pole `event`, a `logUnexpectedRefusal` może stać się jego
  szczególnym przypadkiem.
- Wywołujący przekazują dziś trzy rodzaje wartości błędu: surowy `PostgrestError`, `outcome.error`
  (opcjonalny) i `Error` z `cause`. Builder musi więc obsłużyć wszystkie trzy przez odczyt pól
  z `unknown`, tak jak robi `readString` w `refusal-log.ts:15-19`.
- Prefiks `"<op> failed:"` siedzi już w `message` błędu z `serviceError`. Logowanie `op` osobno i
  `message` bez dodatkowego prefiksu usuwa podwojenie z F1.

## Historical Context (from prior changes)

- `context/audits/observability/2026-11-19_groups.md:111,114,115,137-140`: G-3, G-6 i G-7 oraz
  propozycja helpera. Część kotwic linii jest nieaktualna (np. G-3 wskazuje `attendance.ts:55-57`,
  a kod jest dziś w `:52` i `:62-65`). Sama treść ustaleń nadal się zgadza.
- `context/archive/2026-11-20-log-unexpected-refusals/plan.md:50-58`: reguły PII i kształt
  `event` przygotowany pod krok 4.
- `context/archive/2026-11-20-service-error-cause/plan.md:25,29-31,179` i
  `reviews/impl-review.md:28-56`: niepewność serializacji `cause` w produkcji oraz F1, F2 i F3
  (wszystkie PENDING, odłożone do tego kroku).
- `context/archive/2026-11-19-middleware-auth-error-logging/plan.md:49,71-72`: linia z prefiksem
  celowo jeszcze nie jest JSON-em (do kroku 4).

## Related Research

- `context/archive/2026-11-19-testing-api-error-paths/research.md`: ścieżki błędów API i kontrakt
  odpowiedzi.

## Open Questions

Decyzje dla `/10x-plan`:

1. **Status gałęzi `unknown`.** Opcje:
   - zostawić 302 + `event: "write_failed"` (zgodne z §6.4 test-plan i PRG);
   - przejść na 5xx, co wymaga zmiany §6.4, nowej strony błędu bez linku do `/api/...` i godzi się
     z ponowieniem POST po odświeżeniu.
2. **Lista kategorii `event`.** Do rozstrzygnięcia, czy dodać `read_failed` (wiersze 6, 13, 18, 28)
   i `auth_*` (wiersze 3–4), czy wiersze 3–4 zostają przy `authErrorLogFields` tylko w formie
   pojedynczego obiektu.
3. **`cause.details`/`hint` (F3).** Wybór: whitelist (tylko `code` z `cause`) albo świadome
   dopuszczenie dla odczytów.
4. **`joinByInvite` (wiersze 1–2).** Wybór: przekazać id do serwisu albo przenieść log do 3
   wywołujących (`api/auth/signin.ts:42`, `api/auth/signup.ts:48`, `api/groups/join.ts:31`). Przy
   signin/signup nie ma jeszcze `locals.user`.

Niezweryfikowane fakty, do sprawdzenia po wdrożeniu (jeden testowy deploy):

- czy Workers Logs indeksuje drugi argument `console.error("prefix:", obj)` i string z
  `JSON.stringify`;
- nazwa pola poziomu w Query Builderze;
- jak serializuje się zagnieżdżony `Error` lub `stack`;
- czy Issues (beta) wystarczy jako „alert na `event`”.
