---
date: 2026-11-17T08:42:02+01:00
researcher: Claude Code (claude-opus-5-5)
git_commit: 0980fb0
branch: main
repository: carpooling
topic: "Audyt UI widoku /groups/[id]/statystyki względem kontraktu design-systemu (tokeny + komponenty)"
tags: [research, ui, design-tokens, shadcn, group-stats, 10x-ui]
status: complete
last_updated: 2026-11-17
last_updated_by: Claude Code (claude-opus-5-5)
---

# Research: Audyt UI widoku statystyk grupy

**Date**: 2026-11-17T08:42:02+01:00
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: 0980fb0
**Branch**: main
**Repository**: carpooling
**Issue**: https://github.com/pstawik/carpooling/issues/49

## Research Question

Dwukierunkowy audyt widoku `/groups/[id]/statystyki` (`src/pages/groups/[id]/statystyki.astro`, jeden plik, 124 linie, z komponentów potomnych tylko `Topbar`), zgodnie z `/10x-ui`:

1. **Źródło → widok:** które tokeny z `src/styles/global.css` i komponenty z `src/components/ui/` oraz `src/components/groups/group-page-classes.ts` widok czyta.
2. **Widok → źródło:** jaki token/komponent powinien pokryć każdy literał (11 linii ze skanu).
3. **Architektura:** wejścia (wylogowany, nie-członek, błąd ładowania, brak zakończonych terminów, brak dzieci, brak kierowców), kitchen sink, guard.

Wynik: 3–5 zarzutów z `plik:linia` i skutkiem dla użytkownika (`## Charges`).

## Summary

- **Wariant kontraktu: istniejący design system.** Tokeny `.dark` (`global.css:46-83`, publikacja `:85-124`), komponenty `card`, `alert`, `button`, `badge`, `input` w `src/components/ui/`, stałe klas w `group-page-classes.ts:10-52`. Dwa sąsiednie widoki już je czytają (`[id].astro`, `terminy/[eventId].astro:5-20`). Ten widok czyta z warstwy tokenów tylko `bg-cosmic` (`statystyki.astro:45`); importów z `ui/` i z `group-page-classes.ts`: 0 (`:1-7`).
- **Skan literałów (wzorzec `CLEANED_VIEWS`, ręcznie na `:1-124`):** 11 linii z trafieniem — `:40`, `:41`, `:50`, `:57`, `:65`, `:73`, `:85`, `:94`, `:101`, `:103`, `:118` — 18 klas palety w sumie. Widoku nie ma w `CLEANED_VIEWS` (`scripts/check-ui-literals.mjs:10-20`).
- **Nie trzeba nowych wartości:** każdy literał ma rolę w `.dark`, a cztery z nich mają wartość identyczną z literałem (`--card` = `white/10`, `--border` = `white/10`, `--muted-foreground` = blue-100 przy 70 %, `global.css:50`, `:66`, `:59`; `bg-secondary/50` = 5 % bieli jak `bg-white/5`, `global.css:56`). Widoczne różnice po przeniesieniu: nagłówek bez gradientu, błąd w `Alert`, link powrotu w wariancie `outline` z obwódką fokusu, promień karty `rounded-xl` zamiast `rounded-2xl`.
- **Architektura:** wejścia są poprawne (logowanie przez middleware, 404 dla nie-członka, `:14-21`). Zarzut dotyczy pustego stanu: przy 0 zakończonych terminów widok pokazuje dwie karty (`:63-76`), a sekcje nie są regionami. Kitchen sinka i guardu brak.

## Charges

Każdy zarzut: dowód (`plik:linia`, wszystkie w `src/pages/groups/[id]/statystyki.astro`, chyba że podano inaczej) → co powinno go pokryć → skutek dla użytkownika.

### C1 — Brakujące tokeny: karty, wiersze, nagłówek i tekst wyciszony wpisane na sztywno (missing tokens)

- **Dowód:**
  - karta `rounded-2xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur-xl sm:p-6` — `:40` (lokalne `cardClass`, 5 użyć: `:56`, `:63`, `:72`, `:79`, `:91`; w jednym renderze widać 1 (błąd), 2 (pusty) albo 3 (dane) karty);
  - wiersz `rounded-xl border border-white/10 bg-white/5 p-3` — `:41` (lokalne `rowClass`, `:83`, `:98`);
  - nagłówek gradientowy `from-blue-200 to-purple-200 … text-transparent` — `:50` (oba oczyszczone widoki mają `text-foreground`: `[id].astro:108`, `[eventId].astro:102`);
  - tekst wyciszony `text-blue-100/70` — `:65`, `:73`, `:85`, `:94`, `:101`, `:103`.
- **Co powinno pokryć:** `Card` (`ui/card.tsx:4-12`) + `cardClass` (`group-page-classes.ts:33`), `listItemClass` (`group-page-classes.ts:46`), `text-foreground`, `text-muted-foreground` — wszystkie role opublikowane w `@theme inline` (`global.css:90-110`).
- **Skutek dla użytkownika:** członek wchodzi tu ze strony grupy jednym kliknięciem (`[id].astro:200`) i dostaje jedyny wśród trzech widoków grupy (`[id]`, `terminy/[eventId]`, `statystyki`) nagłówek z gradientem oraz karty o innym promieniu; każda przyszła zmiana tokenu (np. kontrastu `--muted-foreground`) ominie ten widok, a tekst wyjaśnienia i liczby przejazdów zostaną w starym odcieniu.

### C2 — Brakujący komponent współdzielony: błąd ładowania bez `Alert` (missing shared component)

- **Dowód:** przy wyjątku z `countFinishedEvents`/`getGroupStats` (`:27-38`) widok pokazuje kartę z akapitem `text-sm text-red-300` i `role="alert"` (`:55-59`) — bez ikony i bez `Alert`. Ten sam rodzaj błędu w planie terminu: `Alert variant="destructive"` + `CircleAlert` (`[eventId].astro:113-117`).
- **Co powinno pokryć:** `Alert`/`AlertDescription` (`ui/alert.tsx:5-47`, wariant `destructive` `:11-12`) z `CircleAlert` z `lucide-react`.
- **Skutek dla użytkownika:** błąd jest sygnalizowany tylko kolorem (czerwony akapit w zwykłej karcie) i wygląda inaczej niż identyczny błąd „Nie udało się wczytać planu.” na sąsiednim widoku; `text-red-300` nie podąża za `--destructive` (`global.css:62`).

### C3 — Brakujący komponent współdzielony: ręcznie zbudowany przycisk „Wróć do grupy” bez obwódki fokusu (missing shared component)

- **Dowód:** `<a class="inline-flex min-h-11 items-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20">` — `:116-121`. Brak klasy `focus-visible:*`; jedyny styl fokusu to globalne `outline-ring/50` z warstwy bazowej (`global.css:132`), czyli kolor obwódki bez jej szerokości/offsetu — wygląd do potwierdzenia zrzutem (inferencja).
- **Co powinno pokryć:** `linkButtonClass` (`group-page-classes.ts:37` → `buttonVariants({ variant: "outline" })` z `focus-visible:ring-ring/50`, `ui/button.tsx`), tak jak link powrotu w planie terminu i link do statystyk na stronie grupy (`[id].astro:200`).
- **Skutek dla użytkownika:** jedyna kontrolka na tej stronie (poza `Topbar`) — użytkownik klawiatury po Tab nie widzi wyraźnie, że fokus jest na „Wróć do grupy”; przycisk wygląda inaczej niż „Statystyki grupy”, którym tu przyszedł.

### C4 — Nieprzypadkowa architektura: pusty stan z dwóch kart i sekcje bez regionów (accidental architecture)

- **Dowód:**
  - przy `finishedCount === 0` renderują się dwie karty: „Zakończone terminy: 0” + wyjaśnienie reguł liczenia (`:63-69`) i osobna karta „Brak zakończonych terminów…” (`:71-76`). Wyjaśnienie, jak liczy się przejazd i nieobecność, jest pokazane przy braku jakichkolwiek liczb;
  - sekcje `#kierowcy` (`:79`) i `#dzieci` (`:91`) to `<section>` z `<h2>`, bez `role="region"`/`aria-labelledby` (oczyszczone widoki mają: `[id].astro:123`, `[eventId].astro:120`); nikt nie linkuje do tych kotwic (grep `statystyki` w `src/`, `scripts/`: tylko `[id].astro:200` i `smoke.mjs:123`);
  - brak dzieci przy >0 terminach: komunikat „W grupie nie ma jeszcze dzieci.” (`:93-94`) — poprawny pusty stan;
  - brak kierowców: lista nie ma gałęzi pustej (`:82`), ale `group_driver_stats` zwraca wiersz na każdego obecnego członka (`supabase/migrations/20261116130000_create_engagement_stats.sql:55-60`), a strona dochodzi do zapytania tylko dla członka (`:18-21`), więc w tej ścieżce lista ma ≥1 wiersz (wywołującego) — inferencja z SQL i strażnika strony;
  - wejścia poprawne (bez zarzutu): wylogowany → middleware (`/groups/*`, komentarz `:11`), nie-członek / nieznane / błędne id → ten sam 404 (`:14-21`, smoke `smoke.mjs:630`).
- **Skutek dla użytkownika:** nowa grupa (najczęstszy pierwszy kontakt ze statystykami — wszystkie terminy w przyszłości) widzi „0” i regułę liczenia, zanim cokolwiek jest do policzenia, a właściwa informacja „statystyki pojawią się po pierwszym terminie” jest w drugiej karcie poniżej. Czytnik ekranu nie oferuje nawigacji po regionach „Kierowcy”/„Dzieci”.
- **Status:** forma pustego stanu — do decyzji w `/10x-plan` (Open Questions 1).

### C5 — Brak guardu: widok bez kitchen sinka i poza `CLEANED_VIEWS` (accidental architecture)

- **Dowód:** `CLEANED_VIEWS` (`scripts/check-ui-literals.mjs:10-20`) obejmuje widok grupy i plan terminu z ich kitchen sinkami, ale nie `statystyki.astro`. Kitchen sinki: `/dev/ui-group`, `/dev/ui-event` (`src/pages/dev/ui-event.astro:24-28`) — żaden nie pokazuje statystyk. Stany error i empty wymagają awarii bazy albo grupy bez zakończonych terminów; stanu „są dane” nie da się pokazać lokalnie bez wstawienia terminów w przeszłości jako postgres (smoke nie tworzy rozpoczętych terminów: `context/archive/2026-11-16-group-engagement-stats/plan.md:255`).
- **Co powinno pokryć:** nowy wpis w `CLEANED_VIEWS` + kitchen sink z 7 stanami, renderujący przez te same stałe co widok.
- **Skutek dla użytkownika:** regresja literałów w tym widoku przejdzie `npm run lint`, a zmiana w stanach error/empty/„są dane” nie będzie widoczna przy review — ten widok jest najtrudniejszy do ręcznego sprawdzenia, bo jego główny stan wymaga historii.

## Detailed Findings

### Źródło → widok

- Tokeny: `.dark` zawsze aktywne (AGENTS.md § UI; `src/layouts/Layout.astro`), wartości `global.css:46-83`, publikacja `global.css:85-124`, `bg-cosmic` `global.css:126-128`.
- Klasy tokenowe w widoku: 0 linii (role `primary|secondary|muted|accent|destructive|card|foreground|background|input|ring|link|success` nie występują w `:1-124`).
- Importy z `src/components/ui/`: 0; z `group-page-classes.ts`: 0; `Topbar` (`:3`) jest już w `CLEANED_VIEWS` (`check-ui-literals.mjs:16`).
- Dla porównania plan terminu: 5 importów z `ui/` i 9 stałych (`[eventId].astro:5-20`).

### Widok → źródło (mapowanie literałów)

| Linia | Literał | Rola / komponent | Wartość `.dark` vs literał |
| --- | --- | --- | --- |
| `:40` | `bg-white/10`, `border-white/10`, `text-white`, `rounded-2xl` | `Card` + `cardClass` | `--card` `oklch(1 0 0 / 10%)` = literał (`global.css:50`); `--border` = literał (`:66`); promień `rounded-xl` (`card.tsx:8`) — zmiana o 2 px |
| `:41` | `bg-white/5`, `border-white/10` | `listItemClass` | `bg-secondary/50` = 10 % × 50 % = 5 % (`global.css:56`) |
| `:50` | `from-blue-200 to-purple-200 bg-clip-text text-transparent` | `text-foreground` | widoczna zmiana: biały zamiast gradientu |
| `:57` | `text-red-300` | `Alert variant="destructive"` | `--destructive` `oklch(0.704 0.191 22.216)` (`global.css:62`) |
| `:65`, `:73`, `:85`, `:94`, `:101`, `:103` | `text-blue-100/70` | `text-muted-foreground` | `oklch(0.932 0.032 255.585 / 70%)` (`global.css:59`) = blue-100 przy 70 % |
| `:118` | `border-white/20 bg-white/10 text-white hover:bg-white/20` | `linkButtonClass` | wariant `outline` |

### Baseline 7 stanów

| Stan | Stan obecny w widoku |
| --- | --- |
| default | literały palety (C1), 0 tokenów |
| hover | tylko link powrotu: `hover:bg-white/20` (`:118`) |
| focus-visible | link powrotu bez własnego stylu, globalne `outline-ring/50` (`global.css:132`) — C3, do zrzutu |
| disabled | N/A — widok tylko do odczytu, jedyna kontrolka to link |
| error | błąd ładowania jako czerwony akapit (C2, `:55-59`); widok nie czyta `?error=` |
| empty | dwa poziomy: brak zakończonych terminów (`:71-76`, C4), brak dzieci (`:93-94`); brak kierowców nieosiągalny dla członka (C4) |
| loading | N/A — SSR, wszystkie dane w `Promise.all` przed wysłaniem HTML (`:27-31`), bez wysp React |

### Teksty pilnowane przez smoke

- `smoke.mjs:621` oczekuje w HTML „Statystyki” i „Brak zakończonych terminów”; `:615` — linku `href="/groups/<id>/statystyki"` na stronie grupy. Zmiana nagłówka lub pustego stanu musi zachować oba teksty.

## Code References

- `src/pages/groups/[id]/statystyki.astro:12-38` — strażnik 404 i ładowanie danych
- `src/pages/groups/[id]/statystyki.astro:40-41` — lokalne `cardClass`, `rowClass`
- `src/pages/groups/[id]/statystyki.astro:49-53` — nagłówek z gradientem
- `src/pages/groups/[id]/statystyki.astro:55-59` — błąd ładowania
- `src/pages/groups/[id]/statystyki.astro:63-76` — karta podsumowania i pusty stan
- `src/pages/groups/[id]/statystyki.astro:79-110` — karty „Kierowcy” i „Dzieci”
- `src/pages/groups/[id]/statystyki.astro:116-121` — „Wróć do grupy”
- `src/components/groups/group-page-classes.ts:33`, `:37`, `:40`, `:46` — `cardClass`, `linkButtonClass`, `subHeadingClass`, `listItemClass`
- `src/components/ui/card.tsx:4-12`, `src/components/ui/alert.tsx:5-47` — komponenty kontraktu
- `src/styles/global.css:46-83`, `:85-124` — wartości `.dark` i publikacja
- `src/pages/dev/ui-event.astro` — wzorzec kitchen sinka (7 stanów w `Card` z `role="region"`)
- `scripts/check-ui-literals.mjs:10-20` — `CLEANED_VIEWS`
- `scripts/smoke.mjs:613-630` — testy strony statystyk
- `supabase/migrations/20261116130000_create_engagement_stats.sql:25-60` — wiersz na każdego członka w `group_driver_stats`

## Architecture Insights

- Kontrakt z `group-page-ui` i `event-plan-ui` wystarcza bez nowych tokenów i bez nowych komponentów shadcn: potrzebne są `Card`, `Alert` i stałe z `group-page-classes.ts`, które już istnieją.
- Widok jest czysto SSR i bez formularzy, więc kitchen sink jest prostszy niż `/dev/ui-event`: hover i focus-visible dotyczą jednej kontrolki, disabled i loading są N/A.
- Po tej zmianie `group-page-classes.ts` obsłuży trzy widoki; nazwa pliku nadal pasuje (wszystkie trzy to widoki grupy) — bez potrzeby zmiany.
- Kitchen sink: precedens `event-plan-ui` to osobna strona na widok (`/dev/ui-event`, decyzja z `context/archive/2026-11-17-event-plan-ui/research.md:164`); osobna strona `/dev/ui-stats` daje osobny zrzut i nie wydłuża `/dev/ui-group`.

## Historical Context (from prior changes)

- `context/archive/2026-11-16-group-engagement-stats/plan.md:238-239` — treść kart „Kierowcy”/„Dzieci” i pusty stan dzieci (supported: `:79-110`).
- `context/archive/2026-11-16-group-engagement-stats/plan.md:249` — link do statystyk „w stylu linku »Wróć do panelu«” (partial: link na stronie grupy jest już `linkButtonClass`, `[id].astro:200`; strona statystyk została przy literałach).
- `context/archive/2026-11-16-group-engagement-stats/plan.md:274`, `:294` — pusty stan w grupie bez zakończonych terminów (supported: `:71-76`); forma dwóch kart nie była osobno decydowana w planie (inspekcja `:238-249`).
- `context/archive/2026-11-17-event-plan-ui/research.md:35-96` — ten sam zestaw literałów (`text-blue-100/70`, gradient, `white/10`) w planie terminu; usunięty tam bez nowych tokenów poza `--success`.
- `context/archive/2026-11-16-group-page-ui/tokens.md` — mapowanie literałów „cosmic” na role `.dark`.

## Related Research

- `context/archive/2026-11-17-event-plan-ui/research.md` — audyt planu terminu (wzorzec zarzutów, kitchen sinka).
- `context/archive/2026-11-16-group-page-ui/research.md` — audyt widoku grupy.

## Open Questions

1. Pusty stan (C4): przy 0 zakończonych terminów jedna karta z komunikatem „Brak zakończonych terminów — statystyki pojawią się po pierwszym terminie.” (bez licznika i reguł liczenia), czy jedna karta z licznikiem, komunikatem i regułami? Oba warianty zachowują teksty z `smoke.mjs:621`.
2. Nagłówek: „Statystyki” jako `h1` z nazwą grupy jako wyciszonym wierszem nad nim (wzór `[eventId].astro:100-104`), czy zostawić „Statystyki — {nazwa}” w jednym `h1` z `text-foreground`?
3. Kitchen sink: nowa strona `/dev/ui-stats` (zalecane, precedens `/dev/ui-event`) czy sekcja w `/dev/ui-group`?
4. Do potwierdzenia zrzutem: fokus „Wróć do grupy” przed zmianą (C3) i czytelność `text-muted-foreground` na kartach przy 360 px.
