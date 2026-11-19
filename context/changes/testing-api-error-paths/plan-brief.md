# Ścieżki błędów i walidacja wejścia w API — Plan Brief

> Full plan: `context/changes/testing-api-error-paths/plan.md`
> Research: `context/changes/testing-api-error-paths/research.md`

## What & Why

Faza 4 planu testów, ryzyko #5: błąd backendu albo złośliwe lub brzegowe wejście może skończyć się
500 albo pozornym sukcesem, a rodzic myśli, że zapis się udał. Faza ma udowodnić trzy rzeczy: odmowa
uprawnień daje 404, błąd pola daje 302 z dokładnym kodem z białej listy, nieznany błąd bazy daje
`?error=unknown`. Research znalazł żywy defekt: oba endpointy admina zwracają 500 zamiast 404.

## Starting Point

`POST /api/admin/groups` i `/admins` czytają ciało bez `clone()` i wołają `rewrite("/404")`, więc
Astro rzuca `RewriteWithBodyUsed` (potwierdzone sondą). Czyste mappery błędów i schematy zod nie
mają testów. Trzy poprawki z archiwum nie mają testu regresji: lata 9999/0999/0000, seria
`99999-0x1-01` i ciało nie-formularzowe. Smoke porównuje przekierowania prefiksem, a 7 z 12
endpointów z `rewrite` nie ma kroku 404.

## Desired End State

Nie-admin i anonim dostają 404 z endpointów admina, a grupa nie powstaje. Vitest przypina
mapowanie każdego kodu błędu i granice wejścia według wyroczni spoza kodu. Każdy endpoint z
`rewrite` ma krok 404 w smoke, każda rodzina endpointów ma krok z ciałem nie-formularzowym, a
przekierowania sukcesu i błędu są asertowane dokładnie. §6.4 planu testów opisuje wzorzec.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Poprawka 500 w adminie | `clone().formData()` w 2 plikach, po czerwonym kroku smoke | Minimalna zmiana zgodna ze wzorcem z `invite.ts` i 13 endpointów | Research / Plan |
| Strażnik konwencji `clone()` | Kroki 404 w smoke; reguła lint odłożona do fazy 5 | Faza 5 planu testów to bramki jakości | Plan |
| Prywatne mappery zapisu | Eksport `childWriteResult`, `eventWriteResult` + wydzielenie `attendanceWriteResult`, `driverWriteResult` | Gałąź `unknown` dostaje test bez mockowania klienta | Plan |
| Słabe asercje smoke | `locationExact` dla logowania, rejestracji i wylogowania + dokładny kod w `:221`, `:239` | Zamyka antywzorzec „302 = sukces” nazwany w ryzyku | Plan |
| Zasięg kroków handlera | 404 dla każdego endpointu z `rewrite` + 1 krok z ciałem nie-formularzowym na rodzinę (auth, admin, groups/**, join) | Każdy endpoint zdolny do błędu `rewrite` ma strażnika, bez 40 powtórzeń | Plan |
| Wyrocznie | Ograniczenia `check` w migracjach, decyzje z archiwum, kontrakt „404 = brak prawa” | Test nie może przepisywać oczekiwań z kodu pod testem | Research |
| 500 stron i cicha porażka dołączenia | Poza zakresem | Decyzja ACCEPTED (F6) i decyzja produktowa | Research |

## Scope

**In scope:**
- kroki smoke F9 (nie-admin, anonim, kontrola stanu) i poprawka `clone()`
- Vitest: mappery grup, auth, join, mappery pól, schematy zod, `weeklyDates`
- eksport/wydzielenie 4 mapperów zapisu i ich testy
- smoke: opcja surowego ciała, 5 kroków 404, 4 kroki z ciałem nie-formularzowym, zaostrzenie asercji
- §6.4 i §6.5 w `context/foundation/test-plan.md`

**Out of scope:**
- reguła lint dla `clone()` (faza 5), obsługa 500 stron, komunikat nieudanego dołączenia
- weryfikacja bazy kluczem service-role w smoke, pełna macierz ciał × 15 endpointów, zmiany w `context/archive/`

## Architecture / Approach

Autoryzacja jest w bazie, a endpoint tylko tłumaczy kody Postgresa na HTTP, więc testujemy warstwę
tłumaczenia. Mapper i schemat → Vitest (tanio, pokrywa `unknown`). Czytanie ciała, `rewrite` i
status → smoke (jedyna warstwa, która uruchamia Astro). Pierwsza faza to test czerwony, poprawka,
test zielony; pozostałe dokładają testy do działającego kodu i każde potwierdzają celowym zepsuciem.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. F9: 404 zamiast 500 | Kroki smoke dla admina (czerwone → zielone) + `clone()` w 2 plikach | Formularz odpadający na zod nie dotknie gałęzi `forbidden` |
| 2. Vitest: mappery i schematy | ~8 plików testów, granice z archiwum i migracji | Wyrocznia przepisana z kodu zamiast ze źródła |
| 3. Eksport mapperów zapisu | 4 eksportowane mappery + testy | Refaktor zmieni zachowanie (pilnuje smoke) |
| 4. Smoke: ścieżki błędu | Surowe ciało, 5 × 404, 4 × ciało, dokładne przekierowania | Pusty formularz urlencoded omija `catch` |
| 5. Weryfikacja i cookbook | Pełny zestaw CI + §6.4/§6.5 | — |

**Prerequisites:** lokalny Supabase (`npx supabase start`), działający serwer dla smoke (`npm run dev` lub `npm run preview`), seed z adminem aplikacji.
**Estimated effort:** ~3–4 sesje `/10x-implement` w 5 fazach.

## Open Risks & Assumptions

- Ścieżka zalogowanego nie-admina do 500 wynika z kodu (ta sama gałąź co sondowany anonim); faza 1 potwierdzi ją czerwonym krokiem.
- Zaostrzone asercje mogą ujawnić kolejne rozbieżności; wtedy to błąd aplikacji do opisania, nie asercja do poluzowania.
- Wynik `9999-12-31 23:00` → `22:00Z` zakłada strefę CET w grudniu, jak w decyzji z archiwum.

## Success Criteria (Summary)

- Nikt poza adminem aplikacji nie dostaje 500 ani sukcesu z endpointów admina; CI to pilnuje.
- Każdy znany i nieznany kod błędu oraz każda granica wejścia z archiwum ma test, który robi się czerwony po celowym zepsuciu.
- Nowa osoba dodająca endpoint wie z §6.4, jakie testy i kroki smoke dopisać.
