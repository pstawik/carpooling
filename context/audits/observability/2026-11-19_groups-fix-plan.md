---
type: observability-fix-plan
date: 2026-11-19
source_report: context/audits/observability/2026-11-19_groups.md
---

# Plan poprawek observability: groups

Plan wprowadzania poprawek z audytu `2026-11-19_groups.md`. Każdy krok to osobna zmiana
(`/10x-new` → `/10x-plan` → `/10x-implement`), mały PR do `main`. Kolejność według tego, ile
„ślepoty” usuwa się na jednostkę pracy.

| Krok | Zmiana (change-id) | Zamyka | Rozmiar | Status |
|---|---|---|---|---|
| 1 | `middleware-auth-error-logging` | P-1 | XS (1 plik) | zakończona (PR #80, #81) |
| 2 | `log-unexpected-refusals` | G-1, G-2 | S | zakończona (#82) |
| 3 | `service-error-cause` | G-4, G-5, P-3 | S (mechaniczna) | do zrobienia |
| 4 | `structured-error-logs` | G-6, G-3, G-7 | M | do zrobienia |
| 5 | `observability-followups` | P-2, G-8 | XS | do zrobienia |

## Krok 1: błąd Auth w middleware (P-1, krytyczne)

- **Problem:** `src/middleware.ts:20-23` czyta tylko `data.user` z `supabase.auth.getUser()`.
  Awaria Auth, błąd sieci albo 5xx (`AuthRetryableFetchError`) dają `user = null`, a chronione
  trasy przekierowują na `/auth/signin`. W logach widać tylko 302 i nie ma żadnego wpisu.
- **Zakres:**
  - Odczytać `error` z `getUser()`.
  - Brak sesji (`AuthSessionMissingError`, nieważny token) to normalny stan „niezalogowany” i
    zostaje bez logu.
  - Każdy inny błąd: `console.error` z `error.name`, `error.status`, `error.message` i ścieżką
    żądania. Bez e-maila i bez tokenów.
  - Dla błędu niebędącego brakiem sesji na trasie chronionej: odpowiedź 503 zamiast
    przekierowania na logowanie, żeby awaria nie udawała wylogowania. To decyzja produktowa,
    do potwierdzenia w `/10x-plan`.
  - Logikę klasyfikacji wydzielić do czystej funkcji w `src/lib/` z testem Vitest.
- **Weryfikacja:** lint, `astro check`, `npm test`, `npm run smoke`. Ręcznie: zatrzymać
  kontener Auth w `npx supabase start` i zobaczyć 503 plus wpis w logu.

## Krok 2: logowanie nieoczekiwanych odmów (G-1, G-2, krytyczne/wysokie)

- Wspólny helper, np. `logUnexpectedRefusal(op, error, ids)` w `src/lib/`.
- Wywoływany na gałęziach `forbidden` i 0 wierszy, które dziś dają `rewrite("/404")`, we
  wszystkich `src/pages/api/groups/**`. Na pewno tam, gdzie kod mówi „should not happen”
  (`driver.ts:89`) i przy deklaracji na nadchodzący termin (`attendance.ts:52`).
- `getGroupWithAdmins`: gdy grupa jest widoczna, a własnego członkostwa brak, zapisać wpis
  o nieoczekiwanym stanie.
- Użytkownik dalej widzi 404, więc istnienie grup nadal nie wycieka. Logujemy UUID, nie imiona,
  nicki ani tokeny zaproszeń.
- Uwaga na szum: odmowa dla obcego użytkownika jest normalna. Logować jako `warn` z kodem, żeby
  dało się odfiltrować.

## Krok 3: zachowanie przyczyny błędu (G-4, G-5, P-3)

- 12 miejsc ``throw new Error(`…: ${error.message}`)`` w `src/lib/services/*` zamienić na
  `new Error("… failed", { cause: error })` i dodać `error.code` w treści.
- Bloki `catch` w `attendance.ts:46`, `driver.ts:81`, `dashboard.astro:23`, `join/[token].astro:22`
  mają logować obiekt błędu, nie samo `message`.
- W middleware (`:35`, `:45`) dodać `error.code`.

## Krok 4: strukturalne logi (G-6, G-3, G-7)

- Jeden helper `logError({ op, event, groupId, eventId, userId, error })` wypisujący JSON.
  Stałe pole `event`: `write_failed`, `section_degraded`, `unexpected_refusal`.
- Podpiąć go we wszystkich 26 miejscach `console.error`.
- Decyzja produktowa: czy gałąź `unknown` przy zapisie ma zmieniać status (500/503) zamiast
  302. Wpływa to na wzorzec PRG.
- Po wdrożeniu: jedno zapytanie albo alert w Workers Logs na `event`.

## Krok 5: drobne poprawki (P-2, G-8)

- `createClient` zwracający `null` (brak sekretów): jeden log na isolate, a w produkcji
  rozważyć rzucenie błędu.
- Nieudane dołączenie przez zaproszenie: dodać `?error=unknown` i pokazać komunikat na
  `/join/[token]`.

## Poza zakresem

Wybór error trackera (np. Sentry dla Cloudflare) robi `/10x-infra-research`. Kroki 1–4 warto
zrobić niezależnie od niego, bo decydują, co tracker w ogóle dostanie.

Po krokach 1–3 warto uruchomić `/10x-observability-audit --verify
context/audits/observability/2026-11-19_groups.md`.
