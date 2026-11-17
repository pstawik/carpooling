---
date: 2026-11-17T10:47:31+01:00
researcher: Claude Code (claude-opus-5-5)
git_commit: 917d433
branch: main
repository: carpooling
topic: "Audyt UI widoku /dashboard względem kontraktu design-systemu (tokeny + komponenty)"
tags: [research, ui, design-tokens, shadcn, dashboard, 10x-ui]
status: complete
last_updated: 2026-11-17
last_updated_by: Claude Code (claude-opus-5-5)
---

# Research: Audyt UI widoku panelu (`/dashboard`)

**Date**: 2026-11-17T10:47:31+01:00
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: 917d433
**Branch**: main
**Repository**: carpooling
**Issue**: https://github.com/pstawik/carpooling/issues/52

## Research Question

Dwukierunkowy audyt widoku `/dashboard` (`src/pages/dashboard.astro`, jeden plik, 83 linie, bez komponentów potomnych poza `Layout`), zgodnie z `/10x-ui`:

1. **Źródło → widok:** które tokeny z `src/styles/global.css` i komponenty z `src/components/ui/`, `src/components/Topbar.astro` oraz `src/components/groups/group-page-classes.ts` widok czyta.
2. **Widok → źródło:** jaki token/komponent powinien pokryć każdy literał (11 linii ze skanu).
3. **Architektura:** wejścia (wylogowany, brak profilu, błąd ładowania, 0 grup, app-admin), kitchen sink, guard.

Wynik: 3–5 zarzutów z `plik:linia` i skutkiem dla użytkownika (`## Charges`). Sześć szkiców z issue #52 zostało tu scalonych w pięć (szkice 2 i 4 → C2).

## Summary

- **Wariant kontraktu: istniejący design system.** Wartości `.dark` w `global.css:46-83`, publikacja w `@theme inline` `:85-124`; komponenty `card`, `badge`, `alert`, `button` w `src/components/ui/`; stałe klas w `group-page-classes.ts`; wspólny nagłówek `Topbar.astro` (w `CLEANED_VIEWS`, `scripts/check-ui-literals.mjs:16`). Trzy widoki grupy już z nich korzystają (`[id].astro:104-108`, `statystyki.astro`, `terminy/[eventId].astro`).
- **Ten widok czyta z warstwy tokenów tylko `bg-cosmic`** (`dashboard.astro:23`). Importy z `ui/`, z `group-page-classes.ts` i `Topbar`: 0 (`:1-4`).
- **Skan literałów (wzorzec z `/10x-ui`) na `:1-83`:** 11 linii z trafieniem — `:24`, `:25`, `:28`, `:31`, `:34`, `:42`, `:45`, `:53`, `:56`, `:67`, `:74`. Widoku nie ma w `CLEANED_VIEWS` (`check-ui-literals.mjs:10-22`).
- **Nowe wartości nie są potrzebne:** każdy literał ma rolę w `.dark`. Wartości identyczne: `--card`/`--border` = `white/10` (`global.css:50`, `:66`), `--primary` = `purple-600` (`:54`, ta sama wartość oklch co paleta Tailwind 4), `--input` = `white/20` (`:67`). Widoczne różnice po przeniesieniu: nagłówek bez gradientu, tekst wyciszony 70 % zamiast 80 % (`text-blue-100/80` → `--muted-foreground` `:59`), błąd w `Alert`, pigułka „administrator” w pełnym `--primary` zamiast 60 %.
- **Architektura:** wejścia są poprawne (logowanie przez middleware, `middleware.ts:5`, smoke `smoke.mjs:46`). Zarzut dotyczy układu: panel to wyśrodkowana karta w stylu strony logowania (identyczna jak `404.astro:8-9`), bez `Topbar`, z ręcznie powtórzonym nickiem i wylogowaniem; pusty stan nie mówi, jak dołączyć do grupy.

## Charges

Każdy zarzut: dowód (`plik:linia`, wszystkie w `src/pages/dashboard.astro`, chyba że podano inaczej) → co powinno go pokryć → skutek dla użytkownika.

### C1 — Brakujące tokeny: karta, nagłówek, tekst wyciszony i wiersze grup wpisane na sztywno (missing tokens)

- **Dowód:**
  - karta `rounded-2xl border border-white/10 bg-white/10 … text-white backdrop-blur-xl` — `:24`;
  - nagłówek gradientowy `from-blue-200 to-purple-200 bg-clip-text … text-transparent` — `:25` (oczyszczone widoki mają `text-foreground`, `[id].astro:108`);
  - tekst wyciszony `text-blue-100/80` — `:28`, `text-blue-100/70` — `:45`; wyróżnienie `text-white` — `:31`, `:34`;
  - wiersz grupy `border-white/10 bg-white/5 … hover:bg-white/15` — `:53`.
- **Co powinno pokryć:** `Card` (`ui/card.tsx:4-12`) + `cardClass` (`group-page-classes.ts`), `text-foreground`, `text-muted-foreground`, `listItemClass` (`bg-secondary/50` = 5 % bieli jak `bg-white/5`, `global.css:56`) z `hover:bg-accent`.
- **Skutek dla użytkownika:** panel to pierwszy ekran po zalogowaniu i rejestracji (`smoke.mjs:225`), a jedno kliknięcie dalej (strona grupy) użytkownik trafia na inny nagłówek, inne karty i inny odcień tekstu — aplikacja wygląda jak dwie różne. Każda przyszła zmiana tokenu (np. kontrastu `--muted-foreground`) ominie panel.

### C2 — Brakujące komponenty współdzielone: ręcznie zbudowana pigułka i przyciski bez obwódki fokusu (missing shared component)

- **Dowód:**
  - pigułka „administrator” `rounded-full bg-purple-600/60 px-2 py-0.5 text-xs` — `:56` (kopia `badgeVariants`, `ui/badge.tsx:6-7`, wariant `default` `:10`);
  - „Panel administratora” `<a class="… rounded-lg bg-purple-600 … hover:bg-purple-500">` — `:65-70` (kopia `buttonVariants` wariant `default`, `ui/button.tsx:12`);
  - „Wyloguj” `<button class="… border-white/20 bg-white/10 … hover:bg-white/20">` — `:72-77` (kopia wariantu `outline`, `button.tsx:15-16`; ten sam przycisk jest w `Topbar.astro:16-20`);
  - linki grup `:50-59` — brak klasy `focus-visible:*`. We wszystkich trzech kontrolkach (`:53`, `:67`, `:74`) jedynym stylem fokusu jest globalne `outline-ring/50` z warstwy bazowej (`global.css:132`) — kolor obwódki bez szerokości/offsetu; wygląd do potwierdzenia zrzutem (inferencja).
- **Co powinno pokryć:** `Badge` (`ui/badge.tsx`), `buttonVariants({ variant: "default" })` dla linku admina, `linkButtonClass` (`group-page-classes.ts`, `outline` + `min-h-11`), `focusRingClass` na linkach grup (`group-page-classes.ts`, `focus-visible:outline-ring`).
- **Skutek dla użytkownika:** użytkownik klawiatury po Tab nie widzi wyraźnie, na której grupie jest fokus — a lista grup to główna akcja tego ekranu. Przyciski wyglądają inaczej niż „Wróć do panelu” na stronie grupy (`[id].astro:412`), który prowadzi właśnie tutaj.

### C3 — Brakujący komponent współdzielony: błąd ładowania grup bez `Alert` (missing shared component)

- **Dowód:** przy wyjątku z `listMyGroups` (`:12-17`, `services/groups.ts:42-43`) widok pokazuje akapit `text-sm text-red-300` z `role="alert"` (`:42-44`) — bez ikony i bez `Alert`. Ten sam rodzaj błędu w oczyszczonych widokach: `Alert variant="destructive"` + `CircleAlert` (`[id].astro:117-120`).
- **Co powinno pokryć:** `Alert`/`AlertDescription` (`ui/alert.tsx:5-47`, wariant `destructive` `:11-12`) z `CircleAlert` z `lucide-react`.
- **Skutek dla użytkownika:** błąd jest sygnalizowany tylko kolorem (czerwony tekst pod nagłówkiem „Twoje grupy”), a `text-red-300` nie podąża za `--destructive` (`global.css:62`).

### C4 — Przypadkowa architektura: panel jako karta logowania, bez `Topbar`, z pustym stanem bez następnego kroku (accidental architecture)

- **Dowód:**
  - układ: `flex min-h-screen items-center justify-center` + `max-w-sm … text-center` (`:23-24`) — ten sam szablon co `404.astro:8-9` i strony logowania; widoki grupy używają `mx-auto max-w-xl` + `Topbar` (`[id].astro:104-106`). Lista grup (`:37-62`) jest w karcie o szerokości 384 px, wyrównanej do lewej wewnątrz karty wyśrodkowanej (`:37` `text-left`);
  - duplikacja `Topbar`: nick (`:27-35`) i „Wyloguj” (`:72-77`) robią to samo co `Topbar.astro:10-21`. Smoke sprawdza tylko obecność nicku w HTML (`smoke.mjs:228-230`), więc nick wyrenderowany przez `Topbar` też go spełnia;
  - pusty stan „Nie należysz jeszcze do żadnej grupy.” (`:45`) — do grupy dołącza się wyłącznie przez link zaproszeniowy od administratora (PRD FR-006, `prd.md:84`, `:141`); widok tego nie mówi;
  - kolejność: „Panel administratora” (`:64-71`) jest po liście grup i przed „Wyloguj” — dwa przyciski o różnej wadze na dole karty;
  - wejścia poprawne (bez zarzutu): wylogowany → 302 do `/auth/signin` (`middleware.ts:5`, `smoke.mjs:46`); brak profilu → e-mail zamiast nicku (`:32-34`, `middleware.ts:28-37`); app-admin → link (`:64`, flaga z `middleware.ts:8-10`).
- **Skutek dla użytkownika:** nowy rodzic po rejestracji widzi kartę jak z ekranu logowania z jednym zdaniem „Nie należysz…”, bez wskazówki, że potrzebuje linku od administratora grupy. Nawigacja (nick, wylogowanie) jest w innym miejscu niż na każdej innej stronie zalogowanego użytkownika.
- **Status:** forma układu i treść pustego stanu — do decyzji w `/10x-plan` (Open Questions 1–3).

### C5 — Brak guardu: widok bez kitchen sinka i poza `CLEANED_VIEWS` (accidental architecture)

- **Dowód:** `CLEANED_VIEWS` (`scripts/check-ui-literals.mjs:10-22`) obejmuje trzy widoki grupy, `Topbar` i ich kitchen sinki (`/dev/ui-group`, `/dev/ui-event`, `/dev/ui-stats`), ale nie `dashboard.astro`. Stan błędu wymaga awarii zapytania, stan „0 grup” — nowego konta, stan app-admina — konta z `is_app_admin`.
- **Co powinno pokryć:** wpis w `CLEANED_VIEWS` + kitchen sink `/dev/ui-dashboard` z 7 stanami (wzór `src/pages/dev/ui-stats.astro:1-40`: tylko dev, dane wpisane w stronie, te same stałe co widok).
- **Skutek dla użytkownika:** regresja literałów w pierwszym ekranie po zalogowaniu przejdzie `npm run lint`, a stany błąd / pusty / app-admin nie będą widoczne przy review.

## Detailed Findings

### Źródło → widok

- Tokeny: `.dark` zawsze aktywne (AGENTS.md § UI; `src/layouts/Layout.astro`), wartości `global.css:46-83`, publikacja `:85-124`, `bg-cosmic` `:126-128`.
- Klasy ról (`primary|secondary|muted|accent|destructive|card|foreground|background|input|ring|link|success`) w `dashboard.astro:1-83`: 0 wystąpień.
- Importy z `src/components/ui/`: 0; z `group-page-classes.ts`: 0; `Topbar`: brak (`:1-4`).

### Widok → źródło (mapowanie literałów)

| Linia | Literał | Rola / komponent | Wartość `.dark` vs literał |
| --- | --- | --- | --- |
| `:24` | `bg-white/10`, `border-white/10`, `text-white`, `rounded-2xl` | `Card` + `cardClass` | `--card`, `--border` = literał (`global.css:50`, `:66`); promień `rounded-xl` (`card.tsx:8`) |
| `:25` | `from-blue-200 to-purple-200 bg-clip-text text-transparent` | `text-foreground` | widoczna zmiana: biały zamiast gradientu |
| `:28` | `text-blue-100/80` | `text-muted-foreground` | `--muted-foreground` = blue-100 przy 70 % (`:59`) — o 10 pp ciemniej |
| `:31`, `:34` | `text-white` | `text-foreground` | `--foreground` `oklch(1 0 0)` (`:48`) = literał |
| `:42` | `text-red-300` | `Alert variant="destructive"` | `--destructive` (`:62`) |
| `:45` | `text-blue-100/70` | `text-muted-foreground` | = literał |
| `:53` | `border-white/10 bg-white/5 hover:bg-white/15` | `listItemClass` + `hover:bg-accent` + `focusRingClass` | `bg-secondary/50` = 5 %; `--accent` 10 % (`:60`) vs literał 15 % |
| `:56` | `bg-purple-600/60` | `Badge` (`default`) | `--primary` = purple-600 (`:54`), bez 60 % |
| `:67` | `bg-purple-600 hover:bg-purple-500` | `buttonVariants()` | `bg-primary hover:bg-primary/90` |
| `:74` | `border-white/20 bg-white/10 hover:bg-white/20` | `linkButtonClass` (`outline`) | `dark:border-input` (`--input` 20 %), `dark:bg-input/30` |

### Baseline 7 stanów

| Stan | Stan obecny w widoku |
| --- | --- |
| default | literały palety (C1), 0 tokenów |
| hover | linki grup `hover:bg-white/15` (`:53`), przyciski `:67`, `:74` — wszystkie literały |
| focus-visible | brak własnego stylu w 3 kontrolkach, tylko `outline-ring/50` (`global.css:132`) — C2, do zrzutu |
| disabled | N/A — brak kontrolek, które mogłyby być nieaktywne (linki + submit bez stanu oczekiwania) |
| error | czerwony akapit (C3, `:42-44`); widok nie czyta `?error=` |
| empty | „Nie należysz jeszcze do żadnej grupy.” (`:45`) — bez następnego kroku (C4) |
| loading | N/A — SSR, `listMyGroups` przed wysłaniem HTML (`:12-13`), bez wysp React |

Dodatkowe warianty treści do kitchen sinka: brak profilu (e-mail zamiast nicku, `:32-34`), rola admin w grupie (pigułka, `:55-57`), app-admin (link, `:64`), długa nazwa grupy (`break-words`, `:54`).

### Teksty i struktura pilnowane przez smoke

- `smoke.mjs:228-230` — HTML panelu zawiera nick profilu.
- `smoke.mjs:205-214` (`dashboardWithGroupLink`) — szuka w HTML nazwy grupy i ostatniego `/groups/<uuid>` **przed** nią. Link (`href`) musi poprzedzać nazwę grupy w markupie; między `href` a nazwą nie może pojawić się inny `/groups/`.
- `smoke.mjs:277`, `:297-299` — nazwa grupy obecna / nieobecna w HTML.

## Code References

- `src/pages/dashboard.astro:5-19` — ładowanie grup, flaga błędu
- `src/pages/dashboard.astro:23-35` — układ, karta, nagłówek, nick
- `src/pages/dashboard.astro:37-62` — „Twoje grupy”: błąd, pusty stan, lista z pigułką
- `src/pages/dashboard.astro:64-78` — „Panel administratora”, „Wyloguj”
- `src/components/Topbar.astro:1-36` — wspólny nagłówek (nick, „Panel”, „Wyloguj”)
- `src/components/groups/group-page-classes.ts` — `cardClass`, `linkButtonClass`, `listItemClass`, `focusRingClass`
- `src/components/ui/card.tsx:4-12`, `ui/badge.tsx:6-21`, `ui/button.tsx:7-32`, `ui/alert.tsx:5-47`
- `src/styles/global.css:46-83`, `:85-124`, `:130-134`
- `src/pages/groups/[id].astro:104-120` — wzorzec układu (`max-w-xl`, `Topbar`, `h1`, `Alert`)
- `src/pages/dev/ui-stats.astro:1-40` — wzorzec kitchen sinka
- `scripts/check-ui-literals.mjs:10-22` — `CLEANED_VIEWS`
- `scripts/smoke.mjs:46`, `:205-230`, `:277`, `:297-299` — testy panelu
- `src/middleware.ts:5-10` — ochrona trasy i flaga app-admina

## Architecture Insights

- Kontrakt z `group-page-ui`, `event-plan-ui` i `group-stats-ui` wystarcza bez nowych tokenów i bez nowych komponentów shadcn: `Card`, `Badge`, `Alert`, `buttonVariants`, `Topbar` i stałe z `group-page-classes.ts` już istnieją.
- `group-page-classes.ts` ma w komentarzu nagłówka listę widoków grupy; panel nie jest widokiem grupy. Import stąd działa, ale nazwa pliku przestanie opisywać zawartość — do decyzji w planie (Open Questions 4).
- Ten sam szablon karty-literału ma jeszcze `404.astro:8-20`, strony logowania/rejestracji, `index.astro` i `join/[token].astro` (grep `bg-cosmic`). Poza zakresem tej zmiany (jeden widok); kandydaci na kolejne zmiany.
- `LibBadge.astro` w `src/components/ui/` używa palety (`bg-blue-900/50`, `text-purple-200`) i nie jest używany przez panel — poza zakresem, odnotowane.

## Historical Context (from prior changes)

- `a6bd7ba` „Polish auth UI and show profile on dashboard (p3)” — źródło karty w stylu auth (supported: `:23-35` ma ten sam szablon co strony auth).
- `context/archive/2026-11-16-group-page-ui/plan.md:338` — `Topbar` przeniesiony na tokeny jako „wspólny nagłówek, obecny na każdej stronie” (partial: panel go nie renderuje, `:1-4`).
- `context/archive/2026-11-16-group-page-ui/research.md:91` — powrót do panelu jest też w `Topbar` (supported: `Topbar.astro:13`).
- `context/archive/2026-11-17-group-stats-ui/research.md` — ten sam zestaw literałów (gradient, `white/10`, `text-blue-100/70`, `text-red-300`) usunięty bez nowych tokenów.

## Related Research

- `context/archive/2026-11-17-group-stats-ui/research.md` — audyt statystyk (wzorzec zarzutów, kitchen sinka).
- `context/archive/2026-11-17-event-plan-ui/research.md`, `context/archive/2026-11-16-group-page-ui/research.md`.

## Open Questions

1. Układ (C4): panel jak widoki grupy (`max-w-xl`, `Topbar`, `h1` „Cześć, {imię}!”, lista grup w `Card`, wyrównanie do lewej), czy zostawić wyśrodkowaną kartę i tylko podmienić klasy? Zalecane: jak widoki grupy.
2. Po dodaniu `Topbar`: usunąć z karty nick i „Wyloguj” (zostają w `Topbar`), a w `Topbar` link „Panel” na panelu oznaczyć `aria-current="page"` — czy zostawić jak jest?
3. Treść pustego stanu: np. „Nie należysz jeszcze do żadnej grupy. Poproś administratora grupy o link zaproszeniowy.” — brzmienie do decyzji.
4. Stałe klas: importować z `group-page-classes.ts` (i dopisać panel do komentarza), czy przemianować/wydzielić plik wspólny? Rename dotyka 3 widoków + 3 kitchen sinków.
5. Do potwierdzenia zrzutem: fokus linków grup przed zmianą (C2) i czytelność `text-muted-foreground` (70 % vs dotychczasowe 80 %) przy 360 px.
