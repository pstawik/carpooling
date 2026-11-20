# Observability followups (P-2, G-8): plan brief

> Full plan: `context/changes/observability-followups/plan.md`
> Research: `context/changes/observability-followups/research.md`

## What & Why

Krok 5, ostatni w planie napraw observability dla groups. Zamyka dwie luki:

- **P-2:** brak sekretów Supabase nie zostawia dziś żadnego wpisu w logach, więc zły deploy
  wygląda w Workers Logs jak zwykłe przekierowania na logowanie.
- **G-8:** nieudane dołączenie przez zaproszenie wraca na `/join/<token>` bez komunikatu i
  użytkownik nie wie, że join się nie udał.

## Starting Point

- `createClient` (`src/lib/supabase.ts:5-8`) przy braku sekretów po cichu zwraca `null`. Widać
  tylko baner w `Layout.astro`.
- `joinRedirect` (`src/lib/services/invites.ts:51-62`) wysyła `error` na gołe `/join/<token>`, a
  strona nie czyta query.
- Przy braku configu `/join/<token>` pokazuje 404 „Link nieaktualny” nawet dla poprawnego
  tokenu.

## Desired End State

- Każdy isolate z brakującym sekretem emituje jeden wpis `error`:
  `{ event: "config_missing", op: "createClient", missing: [...] }`. Wpis zawiera same nazwy
  zmiennych. Aplikacja zachowuje się poza tym jak dziś.
- Nieudany join ląduje na `/join/<token>?error=unknown`. Strona pokazuje Alert „Coś poszło nie
  tak, spróbuj ponownie” nad przyciskiem ponowienia.
- Bez configu poprawny token daje 503 zamiast 404.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| P-2 w produkcji | Tylko log, bez throw i bez 503 | Throw dałby 500 na każdej trasie (middleware bez try/catch) i wyłączył baner | Plan |
| Poziom i kształt logu | `error`, `event: "config_missing"`, `missing`: nazwy zmiennych | Brak sekretów to awaria całej aplikacji; alert na event od razu mówi, czego brakuje | Plan |
| Miejsce flagi „raz na isolate” | Zmienna modułowa w `supabase.ts`, pola z czystej funkcji w `error-log.ts` | Jedyne miejsce, gdzie powstaje `null`; `astro:env` nie daje się testować w Vitest | Research + Plan |
| `/join` bez configu | Poprawny token → istniejąca gałąź 503 | Link nie jest fałszywie oznaczany jako martwy; brak nowego UI | Plan |
| Kod błędu joinu | `?error=unknown` tylko dla `kind: "error"`; `invalid` bez zmian | Strona sama daje 404 dla nieaktualnego tokenu | Research |
| Komunikat | Whitelist `error === "unknown"`, `groupErrorMessage`, `<Alert variant="destructive">` tylko w gałęzi formularza | Redirecty niosą kody, nie tekst; 503/404 mają pierwszeństwo | Research |
| Status HTTP z `?error=unknown` | 200 | Wzorzec PRG w całej aplikacji | Plan |

## Scope

**In scope:**
- `config_missing` w `ErrorLogEvent`, `configMissingLogFields` z testem, flaga w `createClient`
- `joinRedirect` z `?error=unknown` i świadoma aktualizacja `invites.test.ts:26-28`
- Alert i 503 bez configu w `src/pages/join/[token].astro`

**Out of scope:**
- Throw lub 503 w middleware przy braku configu
- Sprzątanie klas palety w `[token].astro` i dopisanie do `CLEANED_VIEWS` (osobna zmiana `/10x-ui`)
- Test E2E dla G-8 (nieudanego RPC nie da się wywołać z przeglądarki)
- Log w `config-status.ts`

## Architecture / Approach

Logi trzymają się kontraktu z `structured-error-logs`: jeden obiekt przez `emitLog`, stałe pole
`event`, własny typ pól jak `authFailedLogFields`. G-8 korzysta z istniejącego słownika
`group-errors.ts`, wzorca whitelisty z `terminy/[eventId].astro:63` i komponentu `Alert`.
Endpointy się nie zmieniają, bo wszystkie 3 wywołania korzystają z `joinRedirect`.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
|---|---|---|
| 1. Log braku konfiguracji (P-2) | Jeden wpis `config_missing` na isolate | Wyciek wartości sekretu do logu (pokryty testem) |
| 2. Komunikat po nieudanym joinie (G-8) + 503 bez configu | `?error=unknown`, Alert, 503 zamiast 404 | Komunikat widoczny w gałęzi 404/503 (kryterium ręczne) |

**Prerequisites:** lokalny `npx supabase start` i `.dev.vars` (do kroków ręcznych).
**Estimated effort:** ~1 sesja, 2 małe fazy (rozmiar XS).

## Open Risks & Assumptions

- „Raz na isolate” zakłada, że zmienna modułowa żyje tyle co isolate Workera. Przy wielu
  isolate'ach wpisów będzie kilka, po jednym na isolate, i tak ma być.
- Zmiana testu `error` w `invites.test.ts` jest celowa (G-8). Oracle F2 („nigdy na stronę
  wyglądającą na sukces”) zostaje spełniony.

## Success Criteria (Summary)

- Zły deploy bez sekretów widać w Workers Logs po jednym zapytaniu na `event = "config_missing"`.
- Użytkownik po nieudanym joinie widzi komunikat i może od razu ponowić.
- Lint, `astro check`, `npm test`, build i smoke są zielone.
