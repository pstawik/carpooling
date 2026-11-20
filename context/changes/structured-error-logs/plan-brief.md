# Strukturalne logi błędów — Plan Brief

> Full plan: `context/changes/structured-error-logs/plan.md`
> Research: `context/changes/structured-error-logs/research.md`

## What & Why

To krok 4 planu poprawek observability (G-6, G-3, G-7). Dziś logi błędów to tekst z prefiksem.
Brakuje w nich id grupy, terminu i użytkownika, a nieudany zapis kończy się 302, który na
wykresach statusów wygląda jak sukces. Każdy log ma się stać jednym obiektem z polem `event`, tak
żeby jedno zapytanie albo alert w Workers Logs pokrywało wszystkie awarie.

## Starting Point

W `src/` jest 28 linii logowania (27 `console.error`, 1 `console.warn`) w trzech formach, żadna nie
jest pojedynczym obiektem. Do tego dochodzi `logUnexpectedRefusal` z prefiksem. 7 miejsc wypisuje
`details`/`hint` z `cause` (F3). Wzorzec whitelisty już istnieje w `refusal-log.ts` i
`auth-error.ts`.

## Desired End State

Każdy log błędu to `console.<level>({ event, op, name?, code?, message?, userId?, groupId?, … })`
z jednego helpera `src/lib/error-log.ts`, który jest jedynym miejscem z `console` w `src/`.
Użytkownik widzi te same odpowiedzi co dziś. W Query Builderze Cloudflare da się filtrować po
`event`, `op` i id.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Status gałęzi `unknown` | Zostaje 302 + log `write_failed` | Zgodne z §6.4 test-plan i PRG; natywny POST po 5xx ponawiałby się przy odświeżeniu. | Plan |
| Kategorie `event` | `write_failed`, `section_degraded`, `read_failed`, `unexpected_refusal`, `auth_failed` | Każde z 28 miejsc ma kategorię, która je opisuje. | Research / Plan |
| PII (F3) | Whitelist: `name`, `code` i `message`, z `cause`, jeśli istnieje | Jedna reguła PII w repo; `code` wystarcza do diagnozy. | Plan |
| `joinByInvite` | Serwis dostaje `userId` | Jedno miejsce logu; signin i signup biorą id z `data.user`. | Plan |
| Format | Obiekt jako jedyny argument `console` | Tylko ta forma jest udokumentowana jako indeksowana przez Workers Logs. | Research |
| Weryfikacja | Ręcznie po deployu przez `unexpected_refusal` w Query Builderze | Rozstrzyga indeksowanie na prawdziwym środowisku bez kodu testowego. | Plan |

## Scope

**In scope:**
- `src/lib/error-log.ts` z testem; `refusal-log.ts` na nowym helperze
- 15 miejsc `write_failed` (`api/groups/**`, `api/admin/**`, `joinByInvite`)
- 7 `section_degraded`, 4 `read_failed`, 2 `auth_failed` (strony, middleware)
- §6.4 test-plan i status kroku 4 w planie poprawek

**Out of scope:**
- Zmiana statusów HTTP; `details`/`hint`/stack w logach
- `catch` dla zapytań, które dziś dają 500 (decyzja F6)
- Alerty i konfiguracja Issues; P-2 i G-8 (krok 5)

## Architecture / Approach

Czysty builder `errorLogFields(event, op, error, context)` whitelistuje pola błędu (preferując
`cause`) i znane klucze kontekstu. `emitLog`/`logError` to jedyny `console[level](fields)`. Odmowy
i Auth zachowują swoje dotychczasowe buildery, ale emitują przez ten sam wrapper.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Helper i odmowy | `error-log.ts` + test; odmowy jako jeden obiekt | Złamanie kształtu `refusalLogFields` (chroni go niezmieniony test) |
| 2. Trasy zapisu | 15 × `write_failed` z id; `userId` w `joinByInvite` | Przypadkowe zalogowanie tokenu lub e-maila |
| 3. Odczyty, strony i middleware | `section_degraded`/`read_failed`/`auth_failed`, dokumentacja, weryfikacja produkcyjna | Workers Logs może nie indeksować pól zgodnie z dokumentacją |

**Prerequisites:** kroki 1–3 planu poprawek zakończone (#80–#86); `npx supabase start` do
weryfikacji ręcznej; dostęp do dashboardu Cloudflare po deployu.
**Estimated effort:** ok. 1–2 sesje, 3 fazy.

## Open Risks & Assumptions

- Indeksowanie pól i nazwa pola poziomu w Workers Logs są niepotwierdzone. Kryterium 3.8 to
  rozstrzygnie.
- Wyszukiwania po `failed:` przestaną trafiać w trasy zapisu. Zastępuje je filtr po `event`/`op`.

## Success Criteria (Summary)

- Nieudany zapis daje ten sam baner co dziś, a w logu jest obiekt `write_failed` z `op`, `code`,
  `userId` i `groupId`.
- W `src/` poza testami jedynym `console` jest helper, a w logach nie ma `details`/`hint`.
- W produkcji filtr po `event` w Query Builderze zwraca wpisy z osobnymi polami.
