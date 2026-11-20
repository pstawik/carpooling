# Logowanie błędów Supabase Auth w middleware: brief planu

> Pełny plan: `context/changes/middleware-auth-error-logging/plan.md`

## Co i dlaczego

Middleware odrzuca `error` z `supabase.auth.getUser()`. Awaria Supabase Auth (sieć, 5xx) wygląda
więc jak masowe wylogowanie: chronione trasy przekierowują na `/auth/signin`, a w Workers Logs
nie ma ani jednej linii. Rodzic myśli, że go wylogowało, a logowanie i tak nie działa. To finding
P-1 (krytyczny) z audytu observability, krok 1 planu poprawek, issue #79.

## Punkt wyjścia

`src/middleware.ts:20-23` czyta tylko `data.user`. auth-js przy każdym `AuthError` zwraca
`{ user: null, error }` i nie rzuca wyjątku. Endpointy `/api/*` same przekierowują na logowanie,
gdy `locals.user` jest `null`.

## Stan docelowy

- Brak sesji działa jak dziś.
- Wygasła lub odrzucona sesja (4xx) działa jak dziś i zostawia jedną linię `warn`.
- Awaria Auth daje linię `error` (nazwa, status, kod, komunikat, ścieżka, bez PII) oraz:
  - na stronach chronionych: stronę 503 „Usługa chwilowo niedostępna” z przyciskiem „Spróbuj
    ponownie”;
  - na `/api/*`: tekstowe 503 z `Retry-After`.

## Kluczowe decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Zachowanie przy awarii na trasie chronionej | 503 zamiast redirectu na logowanie | Awaria nie udaje wylogowania, status 5xx widać w logach | Plan |
| Zakres 503 | Trasy chronione i całe `/api/*`, w tym `/api/auth/*` | Zapis deklaracji podczas awarii nie kończy się na logowaniu; formularz logowania bez sesji nie wywołuje Auth w middleware | Plan |
| `AuthApiError` 4xx | Wylogowany + `console.warn` | Wygasła sesja działa normalnie, a masowe 401 przy złym `SUPABASE_KEY` są widoczne | Plan |
| Brak sesji (`AuthSessionMissingError`) | Bez logu, bez zmian | Normalny stan „niezalogowany” | Audyt |
| Forma 503 na stronach | `src/pages/503.astro` na tokenach ról, przez `next("/503")` | Spójny wygląd, czytelny komunikat; `next()` nie wywołuje drugi raz `getUser()` | Plan |
| Miejsce logiki | Czysta funkcja `classifyAuthError` w `src/lib/auth-error.ts` z testem Vitest | Testowalna bez sieci, middleware zostaje cienkie | Audyt |

## Zakres

**W zakresie:** klasyfikacja błędu `getUser()`, logi `warn`/`error` bez PII, 503 dla `/api/*` i
tras chronionych, strona `503.astro`, wpis w `CLEANED_VIEWS`.

**Poza zakresem:**
- logowanie odmów 42501 (krok 2);
- `error.code` w logach profilu i `is_app_admin` (krok 3);
- logi JSON (krok 4);
- `createClient` → `null` (krok 5);
- retry `getUser()`;
- przerabianie `404.astro`;
- error tracker.

## Architektura / podejście

`getUser()` → `classifyAuthError(error)` → `none`/`signed_out`: bez zmian;
`session_rejected`: `warn` i traktowanie jak niezalogowany; `outage`: `error`, a potem
`/api/*` → `Response` 503, trasa chroniona → `next("/503")`, trasa publiczna → dalej z
`user = null`. Decyzja zapada przed blokiem `PROTECTED_ROUTES`.

## Fazy w skrócie

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Klasyfikacja i middleware | `classifyAuthError` z testem, logi, 503 dla `/api` i tymczasowo tekstowe 503 na stronach | Błędne zaliczenie 4xx do awarii dałoby 503 wylogowanym |
| 2. Strona 503 | `503.astro` na tokenach, `next("/503")`, `CLEANED_VIEWS` | `Astro.url` po `next()` może nie wskazywać oryginalnej ścieżki dla „Spróbuj ponownie” |

**Wymagania wstępne:** `npx supabase start` (Docker) i `.dev.vars` do ręcznej weryfikacji.
**Szacowany nakład:** ok. 1 sesja, 2 małe fazy.

## Otwarte ryzyka i założenia

- `@supabase/auth-js` może nie być bezpośrednią zależnością. Wtedy predykaty bierzemy z
  re-eksportu `@supabase/supabase-js`.
- `AuthApiError` 4xx z błędnego `SUPABASE_KEY` zostaje „wylogowaniem” z linią `warn`, a nie 503.
  Brak alertów na Workers Logs oznacza, że ktoś musi tej linii szukać.
- Awaria Auth nie jest testowana automatycznie (wymaga zatrzymania kontenera), tylko ręcznie.

## Kryteria sukcesu (skrót)

- Zatrzymany kontener Auth daje 503 i linię `auth getUser failed:` w logu, a nie ciche
  przekierowanie na logowanie.
- Wylogowany użytkownik i wygasła sesja dalej trafiają na `/auth/signin`.
- Lint, `astro check`, `npm test`, build i smoke przechodzą.
