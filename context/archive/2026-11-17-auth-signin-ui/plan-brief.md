# Logowanie i rejestracja na kontrakcie design-systemu — Plan Brief

> Full plan: `context/changes/auth-signin-ui/plan.md`
> Research: `context/changes/auth-signin-ui/research.md`
> Issue: https://github.com/pstawik/carpooling/issues/54

## What & Why

Po autouzupełnieniu loginu pola na ekranie logowania robią się musztardowe — to tło przeglądarki przebijające przez półprzezroczyste pole, bo aplikacja nie ma koloru dla tego stanu. Przy okazji ekrany logowania i rejestracji jako ostatnie główne widoki nie są na design-systemie: gradientowy nagłówek, ręczne pola i komunikaty, fokus i błędy w kolorach palety Tailwinda.

## Starting Point

`signin.astro`, `signup.astro` i 6 komponentów `src/components/auth/` mają 21 linii z literałami i jeden import z `ui/` (`Button`, nadpisany). Kontrakt (tokeny `.dark`, `ui/input`/`alert`/`card`/`button`, stałe klas) jest kompletny; brakuje tylko roli dla autouzupełniania.

## Desired End State

Autouzupełnione pola mają fiolet z palety (`--autofill` ≈ `#4a2870`, odcień `--primary`), także przy fokusie, w całej aplikacji. Logowanie i rejestracja to wyśrodkowane karty jak w aplikacji, z polami `ui/input`, komunikatami `Alert` (zielony „Konto utworzone”), widocznym fokusem i błędami w `--destructive`. Zalogowany nie widzi już formularza logowania. Kitchen sink `/dev/ui-auth` i lint pilnują kontraktu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Kolor autouzupełniania | Przyciemniony `--primary`: `oklch(0.36 0.12 302.321)` | Fiolet aplikacji; biały 11,5:1, `--ring` 4,1:1 | Plan (wybór użytkownika) |
| Mechanizm | `--tw-inset-shadow` + `box-shadow` w `@layer base`, + `[data-autofill-preview]` | Działa z obwódką fokusu i daje podgląd w sinku | Research |
| Zakres | Logowanie + rejestracja | Komponenty i tak są wspólne | Plan |
| Zalogowany na `/auth/*` | 302 na `/join/<invite>` albo `/dashboard` | Naprawia wejście, nie gubi zaproszenia | Plan |
| Układ | Wyśrodkowana karta, bez `Topbar` | Skupiony ekran logowania | Plan |
| Pola | `FormField` opakowuje `ui/input` | Formularze bez zmian, jedno miejsce na wygląd | Plan |

## Scope

**In scope:**
- `src/styles/global.css` (rola `--autofill`, reguła bazowa), `tokens.md`
- `src/components/auth/*` (6 plików), `src/pages/auth/signin.astro`, `signup.astro`
- `scripts/smoke.mjs` (kroki wejścia), `src/pages/dev/ui-auth.astro`, `scripts/check-ui-literals.mjs`, `AGENTS.md`

**Out of scope:**
- Adres powrotu po logowaniu, logika API auth, teksty błędów
- `index`, `404`, `join/[token]`, `LibBadge`; układ z `Topbar`

## Architecture / Approach

Najpierw warstwa tokenów (rola + reguła bazowa) — musztarda znika od razu, także na polach poza auth. Potem współdzielone komponenty (oba formularze naraz), potem strony i wejście zalogowanego, na końcu bramka wizualna i strażnik.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Token `--autofill` | Fioletowe autouzupełnianie w całej aplikacji | Zachowanie `:autofill` w Edge/Chrome do sprawdzenia ręcznie |
| 2. Komponenty auth | `ui/input`, `Alert`, `Button` bez nadpisań, fokus | Zmiana od razu w obu formularzach |
| 3. Strony auth | Karty, komunikaty, link, przekierowanie | Ścieżka z `?invite=` dla zalogowanego |
| 4. Kitchen sink | 7 stanów + autouzupełniony + komunikaty | Podgląd musi wyglądać jak prawdziwy `:autofill` |
| 5. Strażnik | `CLEANED_VIEWS` 13 → 22, `AGENTS.md` | — |

**Prerequisites:** lokalny Supabase i `.dev.vars` (smoke, zrzuty); Edge i Chrome z zapamiętanym loginem (faza 1).
**Estimated effort:** ~1–2 sesje, 5 faz.

## Open Risks & Assumptions

- Zgłoszony kolor „musztardowy” to autouzupełnianie przeglądarki — wniosek z kodu, nie odtworzony zrzutem.
- `--tw-inset-shadow` może zachowywać się inaczej w starszych przeglądarkach; reguła ma też zwykły `box-shadow` jako drugą drogę.
- Reguła `:autofill` jest globalna — zmienia też pola strony grupy i panelu admina (zamierzone).

## Success Criteria (Summary)

- Rodzic logujący się zapamiętanym hasłem widzi pola w kolorach aplikacji, nie musztardowe.
- Logowanie i rejestracja wyglądają jak reszta aplikacji, z widocznym fokusem i czytelnymi błędami.
- Zalogowany otwierający `/auth/signin` trafia do panelu (albo do dołączenia do grupy).
