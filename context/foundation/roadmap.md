---
project: CarPooling
version: 1
status: draft
created: 2026-11-09
updated: 2026-11-13
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: first-end-to-end-ride-plan
milestone_seq: 1
milestone_status: open
---

# Roadmap: CarPooling

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; the next milestone continues this file. Archive only when an independent roadmap replaces it.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Pierwszy kompletny plan przejazdu** — Status: open

- **Intent:** Główny scenariusz z PRD działa od początku do końca: administrator aplikacji zakłada grupę, rodzice dołączają przez link, dodają dzieci, administrator grupy tworzy terminy, rodzice deklarują obecność dzieci i kierowanie autem, a wszyscy widzą plan terminu z bilansem miejsc i podstawowe statystyki.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every S-NN below is `done`.
- **Scope anchors:** wszystkie wymagania konieczne FR-001, FR-002, FR-004, FR-005, FR-006, FR-010–FR-017 oraz US-01. Wymagania opcjonalne FR-007 i FR-009 są w `## Parked`.

## Vision recap

Rodzice dzieci z tych samych zajęć dodatkowych ustalają wspólne dojazdy na czacie, więc dzień przed zajęciami nie wiadomo, które dzieci jadą, kto je wiezie i czy miejsc wystarczy. CarPooling ma być jednym miejscem ze stanem planu: członek grupy widzi terminy, deklaruje obecność dziecka i prowadzenie auta z liczbą miejsc oraz widzi deklaracje pozostałych. Czat zostaje do rozmowy, aplikacja trzyma aktualny stan i bilans miejsc.

## North star

**S-08: Rodzic widzi pełny plan terminu z kierowcami, bilansem miejsc i ostrzeżeniem o niedoborze** — to dokładnie US-01 i krok 8 kryteriów sukcesu; przy celu „szybkość dowiezienia” wszystko inne w tym kamieniu milowym istnieje po to, żeby ten widok zadziałał.

> „Gwiazda przewodnia” (north star) to najmniejszy kompletny przepływ widoczny dla użytkownika, którego dowiezienie udowadnia, że produkt działa — dlatego jest ustawiony tak wcześnie, jak pozwalają jego zależności.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                                 | Prerequisites | PRD refs                    | Status   |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------ | ------------- | --------------------------- | -------- |
| S-01 | signup-with-profile             | założyć konto z imieniem, nickiem i opcjonalnym telefonem oraz pozostać zalogowanym | —             | FR-001, FR-002              | done |
| S-02 | app-admin-creates-group         | (admin aplikacji) utworzyć grupę i wskazać jej administratora                        | S-01          | FR-004                      | done        |
| S-03 | join-group-by-invite-link       | (admin grupy) wygenerować link zaproszeniowy; użytkownik dołącza przez link          | S-02          | FR-005, FR-006              | done |
| S-04 | parent-adds-child               | dodać, edytować i usunąć swoje dziecko przypisane do grupy                          | S-02          | FR-010                      | done        |
| S-05 | group-admin-manages-events      | (admin grupy) tworzyć, edytować i usuwać terminy; członek widzi listę terminów      | S-02          | FR-011, FR-012              | done        |
| S-06 | weekly-event-generator          | (admin grupy) wygenerować terminy cotygodniowe bez duplikatów                        | S-05          | FR-013                      | done |
| S-07 | child-attendance-declaration    | zadeklarować „jedzie/nie jedzie” dziecka i zobaczyć plan dzieci terminu              | S-04, S-05    | FR-014, FR-016, US-01       | in-progress |
| S-08 | driver-declaration-seat-balance | zadeklarować się jako kierowca i zobaczyć bilans miejsc z ostrzeżeniem               | S-07          | FR-015, FR-016, US-01       | proposed |
| S-09 | group-engagement-stats          | zobaczyć statystyki zakończonych terminów grupy                                      | S-08          | FR-017                      | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme              | Chain                                   | Note                                                                                     |
| ------ | ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| A      | Konta i dostęp     | `S-01` → `S-02` → `S-03`                | Najkrótsza ścieżka do grupy z członkami; S-02 jest wspólnym korzeniem pozostałych strumieni. |
| B      | Terminy            | `S-05` → `S-06`                         | Dołącza do strumienia A w `S-02`; S-06 może iść równolegle ze strumieniem C.            |
| C      | Plan terminu       | `S-04` → `S-07` → `S-08` → `S-09`       | Dołącza do A w `S-02` i do B w `S-05` (przez S-07); prowadzi do gwiazdy przewodniej.     |

## Baseline

What's already in place in the codebase as of `2026-11-09` (auto-researched + user-confirmed).
Slices below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 SSR + React 19 + Tailwind 4, shadcn/ui (button), `src/layouts/Layout.astro`, `src/components/Topbar.astro`.
- **Backend / API:** partial — only auth endpoints (`src/pages/api/auth/signin.ts`, `signup.ts`, `signout.ts`); no input-validation library installed yet.
- **Data:** absent — `supabase/config.toml` only; no `supabase/migrations/`, no schema, no RLS policies.
- **Auth:** partial — Supabase e-mail + password sign-up/sign-in/sign-out via SSR client, middleware with `PROTECTED_ROUTES` (`src/middleware.ts:4`); sign-up collects only e-mail and password (no name, nick, phone), no profile record, no app-admin role.
- **Deploy / infra:** present — Cloudflare Workers Builds auto-deploys `main`; GitHub Actions CI (lint, `astro check`, build, smoke); `protect-main` ruleset.
- **Observability:** partial — Workers observability enabled in `wrangler.jsonc`; no error tracking.

## Foundations

Brak osobnych fundamentów. Jedyna brakująca warstwa to dane (schemat + RLS), a twarda reguła projektu wymaga, żeby każda tabela powstawała razem ze swoimi politykami RLS — dlatego każda tabela wchodzi w pierwszym wycinku, który jej używa, a powtarzalny test izolacji grup powstaje w S-02 razem z pierwszą tabelą grup. Brakująca walidacja wejścia i profil użytkownika wchodzą w S-01.

## Slices

### S-01: Rejestracja z profilem i długa sesja

- **Outcome:** user can założyć konto podając imię, nick, e-mail, hasło i opcjonalnie telefon, zalogować się, wylogować i pozostać zalogowanym na urządzeniu przez długi czas.
- **Change ID:** signup-with-profile
- **PRD refs:** FR-001, FR-002
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jak długo ma trwać „długa sesja” (FR-002)? — Owner: user. Block: no.
- **Risk:** Pierwszy, bo każda kolejna rola i każda tabela odwołuje się do profilu użytkownika; rozbudowuje istniejący przepływ auth zamiast budować nowy.
- **Status:** done

### S-02: Administrator aplikacji tworzy grupę

- **Outcome:** user can (jako administrator aplikacji) utworzyć grupę i wskazać jednego lub więcej jej administratorów; użytkownik widzi tylko grupy, do których należy.
- **Change ID:** app-admin-creates-group
- **PRD refs:** FR-004
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jak technicznie nadawać rolę administratora aplikacji poza interfejsem (PRD §Access Control)? — Owner: team. Block: no.
- **Risk:** Wprowadza pierwsze tabele z danymi grup, więc tu powstaje wzorzec RLS i test izolacji, z którego korzystają wszystkie kolejne wycinki — błąd tutaj powiela się dalej.
- **Status:** done

### S-03: Dołączenie do grupy przez link zaproszeniowy

- **Outcome:** user can (jako administrator grupy) wygenerować i zregenerować link zaproszeniowy, a zalogowany lub nowy użytkownik dołącza przez niego do grupy — nowy automatycznie po rejestracji.
- **Change ID:** join-group-by-invite-link
- **PRD refs:** FR-005, FR-006
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-05, S-06, S-07, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - Co widzi użytkownik, który kliknie link do grupy, w której już jest? — Owner: user. Block: no.
- **Risk:** Przepływ rejestracja → powrót → dołączenie przechodzi przez dwa ekrany i łatwo w nim zgubić link; sam link otwiera dostęp do danych dzieci, więc regeneracja musi natychmiast unieważniać poprzedni.
- **Status:** done

### S-04: Rodzic dodaje dziecko do grupy

- **Outcome:** user can dodać, edytować i usunąć swoje dziecko (imię lub nick) przypisane do jednej grupy, której jest członkiem.
- **Change ID:** parent-adds-child
- **PRD refs:** FR-010
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Mały wycinek, ale dane dzieci są najbardziej wrażliwe — izolacja musi obejmować zarówno grupę, jak i właściciela dziecka.
- **Status:** done

### S-05: Administrator grupy zarządza terminami

- **Outcome:** user can (jako administrator grupy) tworzyć, edytować i usuwać pojedyncze terminy, a każdy członek widzi listę terminów zaczynającą się od najbliższego nadchodzącego.
- **Change ID:** group-admin-manages-events
- **PRD refs:** FR-011, FR-012
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Ustala, jak przechowywany jest moment rozpoczęcia terminu, od którego zależą blokada deklaracji i statystyki (patrz Open Roadmap Questions #2).
- **Status:** done

### S-06: Generator terminów cotygodniowych

- **Outcome:** user can (jako administrator grupy) wygenerować terminy w wybrany dzień tygodnia, w zakresie dat i o wskazanej godzinie, bez duplikatów; każdy termin da się potem edytować i usunąć osobno.
- **Change ID:** weekly-event-generator
- **PRD refs:** FR-013
- **Prerequisites:** S-05
- **Parallel with:** S-03, S-04, S-07, S-08, S-09
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Poza ścieżką do gwiazdy przewodniej, więc można go prowadzić równolegle; reguła duplikatu (ta sama grupa, data i godzina) jest już doprecyzowana w PRD.
- **Status:** done

### S-07: Deklaracja obecności dziecka i plan dzieci terminu

- **Outcome:** user can ustawić dla terminu „jedzie” lub „nie jedzie” każdemu swojemu dziecku i zobaczyć w planie terminu dzieci jadące oraz niejadące, z etykietą „bez deklaracji” przy dzieciach bez deklaracji; po rozpoczęciu terminu status jest tylko do odczytu.
- **Change ID:** child-attendance-declaration
- **PRD refs:** FR-014, FR-016, US-01
- **Prerequisites:** S-04, S-05
- **Parallel with:** S-03, S-06
- **Blockers:** —
- **Unknowns:** Co z dziećmi (i ich deklaracjami) rodzica usuniętego z grupy — dziś zostają widoczne i nikt nie może ich usunąć (impl-review parent-adds-child F2); zdecydować przed usuwaniem członków (FR-007).
- **Risk:** Wprowadza dwie reguły serwerowe naraz — „brak deklaracji = nie jedzie” i blokadę po rozpoczęciu terminu; obie muszą działać w bazie, nie tylko w interfejsie.
- **Status:** in-progress

### S-08: Deklaracja kierowcy i bilans miejsc

- **Outcome:** user can zadeklarować się jako kierowca z liczbą miejsc, zmienić lub wycofać deklarację do rozpoczęcia terminu i zobaczyć pełny plan terminu: kierowców z miejscami i telefonem (jeśli podany), łączną liczbę jadących dzieci i ostrzeżenie, gdy miejsc jest za mało.
- **Change ID:** driver-declaration-seat-balance
- **PRD refs:** FR-015, FR-016, US-01
- **Prerequisites:** S-07
- **Parallel with:** S-03, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Gwiazda przewodnia; sam bilans jest prosty (suma miejsc vs liczba „jedzie”), ryzyko leży w poprawnym połączeniu deklaracji wielu rodziców i widoczności telefonu tylko w obrębie grupy.
- **Status:** proposed

### S-09: Statystyki zaangażowania grupy

- **Outcome:** user can zobaczyć dla zakończonych terminów liczbę przejazdów w roli kierowcy każdego członka oraz liczbę obecności i nieobecności każdego dziecka (nieobecność = jawne „nie jedzie” + brak deklaracji).
- **Change ID:** group-engagement-stats
- **PRD refs:** FR-017
- **Prerequisites:** S-08
- **Parallel with:** S-03, S-06
- **Blockers:** —
- **Unknowns:** Usunięcie dziecka kasuje kaskadowo jego deklaracje także z rozpoczętych terminów (kompromis S-04, impl-review child-attendance-declaration F1); przed statystykami zdecydować: miękkie usuwanie dzieci, zachowanie wierszy albo blokada usunięcia.
- **Risk:** Ostatni, bo liczy z deklaracji obu typów; do weryfikacji potrzebuje terminów, które już się rozpoczęły.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Issue                                                   | Change ID                       | Suggested issue title                                      | Ready for `/10x-plan` | Notes                                  |
| ---------- | ------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------- | --------------------- | -------------------------------------- |
| S-01       | [#4](https://github.com/pstawik/carpooling/issues/4)    | signup-with-profile             | Rejestracja z imieniem, nickiem i telefonem + długa sesja  | yes                   | Run `/10x-plan signup-with-profile`    |
| S-02       | [#5](https://github.com/pstawik/carpooling/issues/5)    | app-admin-creates-group         | Admin aplikacji tworzy grupę i wskazuje jej administratora | no                    | Czeka na S-01                          |
| S-03       | [#6](https://github.com/pstawik/carpooling/issues/6)    | join-group-by-invite-link       | Link zaproszeniowy i dołączanie do grupy                   | no                    | Czeka na S-02                          |
| S-04       | [#7](https://github.com/pstawik/carpooling/issues/7)    | parent-adds-child               | Rodzic dodaje, edytuje i usuwa dziecko w grupie            | no                    | Czeka na S-02                          |
| S-05       | [#8](https://github.com/pstawik/carpooling/issues/8)    | group-admin-manages-events      | Lista terminów i zarządzanie pojedynczymi terminami        | no                    | Czeka na S-02                          |
| S-06       | [#9](https://github.com/pstawik/carpooling/issues/9)    | weekly-event-generator          | Generator terminów cotygodniowych bez duplikatów           | no                    | Czeka na S-05                          |
| S-07       | [#10](https://github.com/pstawik/carpooling/issues/10)  | child-attendance-declaration    | Deklaracja obecności dziecka i plan dzieci terminu         | no                    | Czeka na S-04, S-05                    |
| S-08       | [#11](https://github.com/pstawik/carpooling/issues/11)  | driver-declaration-seat-balance | Deklaracja kierowcy i bilans miejsc w planie terminu       | no                    | Czeka na S-07; gwiazda przewodnia      |
| S-09       | [#12](https://github.com/pstawik/carpooling/issues/12)  | group-engagement-stats          | Statystyki zakończonych terminów grupy                     | no                    | Czeka na S-08                          |

## Open Roadmap Questions

PRD nie ma otwartych pytań (rozstrzygnięte 2026-11-06). Pytania przekrojowe zebrane przy układaniu roadmapy:

1. [#13](https://github.com/pstawik/carpooling/issues/13) **Czy w hostowanym projekcie Supabase potwierdzenie e-mail przy rejestracji ma być wyłączone?** Obecny przepływ przekierowuje na ekran „potwierdź e-mail”, a PRD nie przewiduje wysyłki e-maili i wymaga automatycznego dołączenia do grupy po rejestracji (FR-006). — Owner: user. Block: no (dotyczy S-01, S-03).
2. [#14](https://github.com/pstawik/carpooling/issues/14) **W jakiej strefie czasowej interpretowane są data i godzina terminu?** Od tego momentu zależą blokada deklaracji i wejście terminu do statystyk, a serwer działa w UTC. — Owner: team. Block: no (dotyczy S-05, S-07, S-08, S-09).
3. [#15](https://github.com/pstawik/carpooling/issues/15) **Kiedy wpuścić własną grupę autora (kryterium drugorzędne)?** Możliwe najwcześniej po S-08, choć S-06 i S-09 jeszcze nie będą gotowe. — Owner: user. Block: no (sekwencjonowanie wdrożenia, nie planowania).

## Parked

- **FR-007: Administrator grupy usuwa członka** — Why parked: wymaganie opcjonalne; przy celu „szybkość dowiezienia” odłożone, w znajomej grupie usunięcie robi administrator technicznie (PRD FR-007). Pierwszy kandydat na kolejny kamień milowy.
- **FR-009: Lista członków z telefonami** — Why parked: wymaganie opcjonalne; telefon kierowcy jest i tak widoczny w planie terminu (S-08, FR-016).
- **Powiadomienia SMS, e-mail, push i integracje z komunikatorami** — Why parked: PRD §Non-Goals.
- **Integracja z kalendarzami i eksport kalendarza/statystyk** — Why parked: PRD §Non-Goals.
- **Aplikacja mobilna** — Why parked: PRD §Non-Goals; wystarczy przeglądarka na telefonie.
- **Automatyczne przydzielanie kierowców i dzieci do aut, trasy, punkty odbioru** — Why parked: PRD §Non-Goals.
- **Płatności i rozliczanie paliwa** — Why parked: PRD §Non-Goals.
- **Czat między członkami** — Why parked: PRD §Non-Goals.
- **Wiele rodzajów zajęć w grupie; zaawansowana cykliczność** — Why parked: PRD §Non-Goals.
- **Zaawansowane wykresy, raporty, wskaźnik sprawiedliwości** — Why parked: PRD §Non-Goals.
- **Zaproszenia e-mail, ważność i unieważnianie linków** — Why parked: PRD §Non-Goals; zastąpione regeneracją linku.
- **Widok kalendarza** — Why parked: PRD §Non-Goals; v2.
- **Edycja profilu, samodzielne opuszczanie grupy, reset hasła, UI zarządzania adminami aplikacji** — Why parked: PRD §Non-Goals (cięcia z sesji kształtowania).

## Milestone History

## Done

- **S-01: user can założyć konto podając imię, nick, e-mail, hasło i opcjonalnie telefon, zalogować się, wylogować i pozostać zalogowanym na urządzeniu przez długi czas.** — Archived 2026-11-10 → `context/archive/2026-11-09-signup-with-profile/`. Lesson: —.
- **S-02: user can (jako administrator aplikacji) utworzyć grupę i wskazać jednego lub więcej jej administratorów; użytkownik widzi tylko grupy, do których należy.** — Archived 2026-11-12 → `context/archive/2026-11-10-app-admin-creates-group/`. Lesson: —.
- **S-03: user can (jako administrator grupy) wygenerować i zregenerować link zaproszeniowy, a zalogowany lub nowy użytkownik dołącza przez niego do grupy — nowy automatycznie po rejestracji.** — Archived 2026-11-12 → `context/archive/2026-11-12-join-group-by-invite-link/`. Lesson: —.
- **S-04: user can dodać, edytować i usunąć swoje dziecko (imię lub nick) przypisane do jednej grupy, której jest członkiem.** — Archived 2026-11-12 → `context/archive/2026-11-12-parent-adds-child/`. Lesson: —.
- **S-05: user can (jako administrator grupy) tworzyć, edytować i usuwać pojedyncze terminy, a każdy członek widzi listę terminów zaczynającą się od najbliższego nadchodzącego.** — Archived 2026-11-13 → `context/archive/2026-11-12-group-admin-manages-events/`. Lesson: —.
- **S-06: user can (jako administrator grupy) wygenerować terminy w wybrany dzień tygodnia, w zakresie dat i o wskazanej godzinie, bez duplikatów; każdy termin da się potem edytować i usunąć osobno.** — Archived 2026-11-13 → `context/archive/2026-11-13-weekly-event-generator/`. Lesson: —.
