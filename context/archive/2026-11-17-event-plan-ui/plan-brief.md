# Event plan UI — Plan Brief

> Full plan: `context/changes/event-plan-ui/plan.md`
> Research: `context/changes/event-plan-ui/research.md`
> Issue: https://github.com/pstawik/carpooling/issues/45

## What & Why

Widok planu terminu (`/groups/[id]/terminy/[eventId]`) przechodzi na ten sam kontrakt design-systemu co widok grupy: tokeny ról i komponenty z `src/components/ui/`. Dziś rodzic, przechodząc z grupy do planu, widzi inny fiolet, nagłówek i linki, a ostrzeżenie o niedoborze miejsc różni się od „Miejsc wystarcza” głównie kolorem. Deklaracja dziecka — pierwszy krok US-01 — leży pod formularzem kierowcy.

## Starting Point

Widok ma 31 linii z literałami palety i 0 klas tokenowych; z `ui/` używa tylko `Button`, nadpisanego przy każdym użyciu. Tokeny `.dark`, `Card`, `Alert`, `Input` i stałe `group-page-classes.ts` istnieją od zmiany `group-page-ui`.

## Desired End State

Widok czyta wyłącznie tokeny i komponenty repo i jest pilnowany przez `check-ui-literals` (0 trafień). Sekcje idą w kolejności Bilans → Twoje dzieci → Plan dzieci → Twój przejazd → Kierowcy. „Miejsc wystarcza” ma własną rolę `--success` i ikonę, błędy mają `Alert` z ikoną, pole miejsc zgłasza błąd czytnikom ekranu, a rodzic bez dzieci dostaje wskazówkę z linkiem. `/dev/ui-event` pokazuje 7 stanów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wariant kontraktu | Istniejący design system — rozszerzyć | Tokeny i komponenty już są i czyta je widok grupy | Research |
| „Miejsc wystarcza” | Nowy token `--success` (+ `-foreground`) i wariant `Alert` `success` | Zachowuje zielony sygnał i daje rolę do ponownego użycia | Plan |
| Kolejność sekcji | Bilans → Twoje dzieci → Plan dzieci → Twój przejazd → Kierowcy | Odpowiada US-01; kotwice przekierowań dalej działają | Plan |
| Po starcie terminu | Kontrolki ukryte jak dziś; `disabled` = N/A z powodem | Mniej szumu, brak martwych kontrolek | Plan |
| Kitchen sink | Nowa strona `/dev/ui-event` | Jeden widok = jeden zrzut | Plan |
| Rodzic bez dzieci | Karta `#twoje-dzieci` zawsze, ze wskazówką i linkiem do `#dzieci` | Pusty stan zamiast znikającej sekcji; kotwica i `lockedError` mają gdzie trafić | Plan |
| Plakietka | `npx shadcn@latest add badge` | Ścieżka stacku zamiast lokalnej klasy | Research |

## Scope

**In scope:**
- `Badge` z shadcn; `--success` w `global.css` i wariant `success` w `alert.tsx`; `tokens.md`
- Przepięcie `[eventId].astro` na tokeny i komponenty, nowa kolejność, `role="region"`, `aria-invalid` na polu miejsc, wskazówka dla rodzica bez dzieci
- `/dev/ui-event`, wpisy w `CLEANED_VIEWS`, aktualizacja `### UI` w `AGENTS.md`

**Out of scope:**
- API, baza, RLS, treści komunikatów; komunikat po udanej deklaracji
- Kontrolki `disabled` po starcie terminu; adres powrotu po logowaniu; inne widoki
- Zmiana nazwy `group-page-classes.ts`; testy zrzutowe Playwright

## Architecture / Approach

Kolejność `/10x-ui`: biblioteka (Badge) → tokeny (`--success`) → widok → stany i strażnik. Wartości `.dark` pochodzą z tych samych literałów co w `group-page-ui`, więc przepięcie jest prawie neutralne wizualnie; świadome zmiany to nagłówek bez gradientu, ikony w komunikatach, kolejność sekcji i wskazówka dla rodzica bez dzieci. Stałe wspólne dla widoku i sinka trafiają do `group-page-classes.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Komponent Badge | `src/components/ui/badge.tsx` | CLI wstawia import pakietu `cn` — przepiąć na `@/lib/utils` |
| 2. Rola `--success` | Token w `:root`/`.dark`/`@theme inline`, wariant `Alert`, `tokens.md` | Kontrast green-400 na szklanej karcie |
| 3. Widok na tokenach | `[eventId].astro` bez literałów, nowa kolejność, aria | Zgubienie id kotwic `#twoje-dzieci`/`#twoj-przejazd` |
| 4. Stany i strażnik | `/dev/ui-event`, `CLEANED_VIEWS`, `AGENTS.md`, zrzuty | Stany error/empty wymagają ręcznie wpisanych danych |

**Prerequisites:** lokalny Supabase (`npx supabase start`) i `.dev.vars` do weryfikacji manualnej; konto z dzieckiem i konto bez dzieci w jednej grupie; termin rozpoczęty i nadchodzący.
**Estimated effort:** ~1–2 sesje w 4 fazach.

## Open Risks & Assumptions

- Git Bash w tej sesji kończy się błędem `add_item` (exit 5) — komendy `npx shadcn`, lint i build może trzeba uruchamiać przez `!` po stronie użytkownika.
- Wariant plakietki (`secondary` vs `outline`) wybierany po zrzucie — oba są tokenowe.

## Success Criteria (Summary)

- Rodzic na 360 px zaznacza dziecku „jedzie” w drugiej karcie i od razu widzi pod nią, kto jedzie.
- Plan terminu wygląda jak część tej samej aplikacji co widok grupy, a niedobór i „Miejsc wystarcza” rozróżnia ikona i tekst, nie tylko kolor.
- `npm run lint` pilnuje widoku i kitchen sinka; `/dev/ui-event` pokazuje wszystkie stany.
