---
date: 2026-11-16T11:35:29Z
researcher: Claude Code (claude-opus-5-5)
git_commit: 7f090e9
branch: main
repository: carpooling
topic: "Audyt UI widoku /groups/[id] względem kontraktu design-systemu (tokeny + komponenty)"
tags: [research, ui, design-tokens, shadcn, groups, 10x-ui]
status: complete
last_updated: 2026-11-16
last_updated_by: Claude Code (claude-opus-5-5)
---

# Research: Audyt UI widoku /groups/[id]

**Date**: 2026-11-16T11:35:29Z
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: 7f090e9
**Branch**: main
**Repository**: carpooling

## Research Question

Dwukierunkowy audyt widoku `/groups/[id]` (`src/pages/groups/[id].astro` + `src/components/groups/{ChildItem,EventItem,InvitePanel}.tsx`), zgodnie z `/10x-ui`:

1. **Źródło → widoki:** które tokeny z `src/styles/global.css` i komponenty z `src/components/ui/` widok faktycznie czyta.
2. **Widok → źródło:** jaki token/komponent powinien pokryć każdy literał; duplikaty pól i komunikatów.
3. **Architektura:** kolejność sekcji vs główny scenariusz rodzica na 360 px, formularze admina w liście terminów, wejście na `/groups` bez id, po wylogowaniu, pusta grupa.

Wynik: 3–5 zarzutów z `plik:linia` i skutkiem dla użytkownika (`## Charges`).

## Summary

- **Wariant kontraktu: świeży starter z martwym plikiem tokenów.** `global.css` definiuje tokeny shadcn (`:root` `global.css:6`, `.dark` `global.css:41`, publikacja `@theme inline` `global.css:75`), ale w czterech plikach widoku nie ma ani jednej klasy tokenowej (`bg-primary`, `text-muted-foreground`, `border-border` itd.) — w całym `src/` takie klasy występują wyłącznie w `src/components/ui/button.tsx` i `src/styles/global.css` (grep po `src/`, 2026-11-16).
- **Ciemny motyw istnieje tylko jako literały.** Klasa `.dark` nie jest nigdzie ustawiana (grep `src/` bez trafień), więc aktywne są jasne wartości `:root`. Ciemny wygląd daje `bg-cosmic` (`global.css:113`) plus literały `bg-white/10`, `text-white`, `text-blue-100/70` w widoku. Skutek uboczny: każdy `<Button>` w tym widoku (14 wystąpień w 4 plikach: 4+4+4+2) nadpisuje wariant `default` (`button.tsx:12`) własnymi klasami.
- **Skan literałów (linie z trafieniem):** `[id].astro` 40, `EventItem.tsx` 5, `InvitePanel.tsx` 4, `ChildItem.tsx` 3.
- **Dwa brakujące komponenty współdzielone:** pole formularza (ten sam string klas 8× w 4 plikach widoku, 7 plików w `src/`) i komunikat info/błąd (6 bloków w `[id].astro`, 6 plików w `src/`). W `src/components/auth/` istnieją `FormField.tsx` i `ServerError.tsx`, ale nie nadają się do tego widoku bez zmian (szczegóły w C3/C4).
- **Architektura:** sekcja „Administratorzy” stoi przed „Terminy”; w karcie „Terminy” lista, link do statystyk i dwa formularze admina są jednym blokiem; wejście bez sesji gubi adres docelowy.

## Charges

Każdy zarzut: dowód (`plik:linia`) → co powinno go pokryć → skutek dla użytkownika.

### C1 — Brakujące tokeny: kolory i powierzchnie wpisane na sztywno (missing tokens)

- **Dowód:**
  - powierzchnia karty `bg-white/10 border-white/10` — `src/pages/groups/[id].astro:91` (używane przez 4 sekcje: `:122`, `:137`, `:334`, `:409`);
  - kolor główny `bg-purple-600 hover:bg-purple-500` — `[id].astro:93`, `ChildItem.tsx:12`, `EventItem.tsx:19`, `InvitePanel.tsx:66`;
  - przycisk drugorzędny `border-white/20 bg-white/10 hover:bg-white/20` — `ChildItem.tsx:13`, `EventItem.tsx:20`, `InvitePanel.tsx:74`, linki-przyciski `[id].astro:201`, `:429`;
  - tekst wyciszony `text-blue-100/70` / `/80` — m.in. `[id].astro:125`, `:146`, `:181`, `:228`, `:342`, `EventItem.tsx:23`, `:109`;
  - nagłówek gradientowy `from-blue-200 to-purple-200` — `[id].astro:101`;
  - fokus pól `focus:ring-purple-400` — 8 wystąpień w 4 plikach widoku (`[id].astro:55`, `:237`, `:249`, `:262`, `:400`, `ChildItem.tsx:42`, `EventItem.tsx:22`, `InvitePanel.tsx:60`).
- **Co powinno pokryć:** `--card`/`--card-foreground` (karta), `--primary`/`--primary-foreground` (akcja główna), `--secondary` lub wariant `outline` (akcja drugorzędna), `--muted-foreground` (tekst wyciszony), `--ring` (fokus), `--border`/`--input` (obramowania) — wszystkie już opublikowane w `@theme inline` (`global.css:75-111`).
- **Skutek dla użytkownika:** odcień „głównego” fioletu i wyciszonego tekstu jest ustalany osobno w każdym pliku; zmiana koloru akcji głównej wymaga edycji 4 plików (po 1 literale `bg-purple-600` w każdym), a kolejne widoki kopiują literały zamiast roli.

### C2 — Nieprzypadkowa architektura: ciemny motyw nie jest aktywny na warstwie tokenów (accidental architecture)

- **Dowód:**
  - `.dark` zdefiniowane (`global.css:41`), ale nigdzie nie ustawiane (grep `class="dark"`/`classList` w `src/`: 0 trafień); `Layout.astro` renderuje `<html lang="pl">` bez klasy;
  - `body` dostaje `bg-background text-foreground` z jasnego `:root` (`global.css:122`) — biel z prawie czarnym tekstem; ciemne tło daje dopiero `div.bg-cosmic` (`[id].astro:97`);
  - wariant `default` Buttona to `bg-primary text-primary-foreground` (`button.tsx:12`), czyli w `:root` prawie czarne tło (`--primary: oklch(0.205 0 0)`); dlatego każde z 14 użyć `<Button>` w widoku nadpisuje kolory przez `className` (`[id].astro:92-93` → `:264`, `:326`, `:402`, `:419`; `ChildItem.tsx:11-13`; `EventItem.tsx:18-20`; `InvitePanel.tsx:13`, `:66`, `:74`);
  - brak `color-scheme` w `src/` (grep 0 trafień); obejście dla natywnego `<select>`: `<option class="text-black">` (`[id].astro:284`);
  - globalny `* { @apply border-border outline-ring/50 }` (`global.css:119`) bierze jasne wartości `--border`/`--ring`.
- **Co powinno pokryć:** aktywny ciemny zestaw wartości (np. klasa `dark` na `<html>` w `Layout.astro` albo przeniesienie ciemnych wartości do `:root`) + `color-scheme: dark`; wtedy `<Button>` bez `className` wygląda poprawnie.
- **Skutek dla użytkownika:** natywne kontrolki (date/time/select) renderują się w jasnym schemacie na ciemnym tle — inferencja z braku `color-scheme`, do potwierdzenia zrzutem (np. słabo widoczna ikona kalendarza w Chrome). Na urządzeniach z overscrollem pod `div.bg-cosmic` widać białe `body` (inferencja z `global.css:122`). Każdy przycisk dodany bez ręcznego nadpisania będzie prawie czarny na ciemnym tle.

### C3 — Brakujący komponent współdzielony: pole formularza (missing shared component)

- **Dowód:**
  - identyczny string klas pola `min-h-11 w-full … border-white/20 bg-white/10 … focus:ring-purple-400` — `[id].astro:55` (`inputClass`), oraz wpisany ręcznie w `:237`, `:249`, `:262`, `:400`; `ChildItem.tsx:42`; `EventItem.tsx:21-22`; wariant dla textarea `InvitePanel.tsx:60`;
  - etykieta `block text-sm text-blue-100/80` — `[id].astro:228`, `:241`, `:253`, `:279`, `:291`, `:297`, `:310`, `:390`; `EventItem.tsx:23`; `InvitePanel.tsx:48`;
  - repo-wide literał `focus:ring-purple-400` w 7 plikach `src/` (m.in. `auth/FormField.tsx`, `admin/groups.astro`, `terminy/[eventId].astro`);
  - istniejący `src/components/auth/FormField.tsx` jest kontrolowany (wymagane `value`/`onChange`/`icon`, `FormField.tsx:12-18`) — nie pasuje do formularzy SSR z `method="POST"` w tym widoku;
  - `src/components/ui/` zawiera tylko `button.tsx` i `LibBadge.astro` — brak `input`/`label`.
- **Co powinno pokryć:** shadcn `input` + `label` (`npx shadcn@latest add input label`), oparte na `--input`/`--ring`/`--destructive` (`aria-invalid`).
- **Skutek dla użytkownika:** pola w tym widoku nie mają stanu błędu ani `disabled` (grep `disabled|aria-invalid` w 4 plikach widoku: 0 trafień), fokus jest na `:focus`, nie `:focus-visible`; zmiana wyglądu pola to 8 edycji w tym widoku.

### C4 — Brakujący komponent współdzielony: komunikat info/błąd (missing shared component)

- **Dowód:**
  - 6 ręcznie zbudowanych bloków w `[id].astro`: info `bg-blue-900/30 text-blue-100` (`:107`, `:208`, `:373`) i błąd `bg-red-900/30 text-red-300` (`:115`, `:216`, `:381`);
  - błędy ładowania bez ramki: `:140` („Nie udało się wczytać terminów.”), `:337` („…dzieci.”);
  - repo-wide literał `bg-(blue|red)-900/30` w 6 plikach `src/`;
  - `src/components/auth/ServerError.tsx` pokrywa tylko wariant błędu i dodaje ikonę `CircleAlert` (`ServerError.tsx:11-14`) — strony auth pokazują błąd z ikoną, strona grupy bez.
- **Co powinno pokryć:** shadcn `alert` (`npx shadcn@latest add alert`) z wariantem `default` i `destructive`, kolor z `--destructive`, ikona + `role`.
- **Skutek dla użytkownika:** na stronie grupy błąd odróżnia od potwierdzenia wyłącznie kolor (brak ikony i nagłówka) — rodzic z daltonizmem lub w słońcu na telefonie może nie odróżnić „Dodano termin” od „Nie udało się”.

### C5 — Nieprzypadkowa architektura: kolejność sekcji i wejścia odpowiadają kolejności dodawania funkcji (accidental architecture)

- **Dowód (kolejność):** `Administratorzy` (`[id].astro:122`) → `Terminy` (`:137`: lista nadchodzących `:148`, minione `:179`, link „Statystyki grupy” `:199`, formularz „Dodaj termin” `:223`, generator `:270`) → `Dzieci` (`:334`) → `Link zaproszeniowy` (`:408`) → „Wróć do panelu” (`:427`). Powrót do panelu jest też w `Topbar` (`Topbar.astro:12`).
- **Dowód (wejścia):**
  - wylogowany na dowolnym `/groups/*` → 302 na `/auth/signin` bez adresu powrotu (`middleware.ts:51-53`; potwierdzone `curl` 2026-11-16 dla `/groups` i `/groups/<uuid>`); po zalogowaniu `api/auth/signin.ts:45` zawsze przekierowuje na `/dashboard` (poza ścieżką z `invite`);
  - `/groups` bez id nie ma trasy (`src/pages/groups/` zawiera tylko `[id].astro` i katalog `[id]/`) → zalogowany dostaje stronę 404 (inferencja z listingu, nie sprawdzone zrzutem);
  - pusta grupa: komunikaty puste istnieją — `:125` (brak adminów), `:146` (brak terminów), `:344` (brak dzieci).
- **Skutek dla użytkownika:** na 360 px rodzic, który przychodzi sprawdzić najbliższy termin, najpierw przewija listę adminów; admin widzi listę terminów, link do statystyk i dwa formularze jako jedną kartę bez podziału. Rodzic otwierający link do grupy z czatu bez aktywnej sesji ląduje po zalogowaniu na panelu, a nie w grupie.
- **Kandydat do odroczenia:** adres powrotu po logowaniu dotyczy `middleware.ts` i `api/auth/signin.ts`, nie wyglądu widoku — do decyzji w `/10x-plan` (może trafić do osobnej zmiany).

## Detailed Findings

### Źródło → widoki

- Tokeny: komplet shadcn `neutral` (`components.json` `baseColor: "neutral"`), `:root` jasny (`global.css:6-39`), `.dark` ciemny (`global.css:41-73`), poprawnie publikowane przez `@theme inline` jako `var(--…)` (`global.css:75-111`) — nie ma surowych kolorów w `@theme inline`.
- Klasy tokenowe w 4 plikach widoku: 0. Importy z `src/components/ui/`: po 1 w każdym z 4 plików (wyłącznie `Button`).
- Narzędzie scalania klas: `cn()` używane w 3 komponentach React (`ChildItem.tsx:3`, `EventItem.tsx:3`, `InvitePanel.tsx:3`); w `[id].astro` `class:list`.

### Widok → źródło (stan 7 stanów, baseline)

| Stan | Stan obecny w widoku |
| --- | --- |
| default | literały palety (C1), 0 tokenów |
| hover | jest: `hover:bg-purple-500`, `hover:bg-white/20`, `hover:underline` (`[id].astro:72`, `:93`) — literały |
| focus-visible | pola: `focus:ring-purple-400` na `:focus` (8×); `Button`: `focus-visible:ring-ring/50` z jasnego `--ring` (`button.tsx:8`); linki i `<summary>` (`:181`, `:272`): brak własnego stylu, działa globalne `outline-ring/50` (`global.css:119`) + styl przeglądarki — inferencja, do zrzutu |
| disabled | brak w 4 plikach widoku (grep 0) |
| error | komunikaty z query param (`group-errors` → `:113-120`, `:214-221`, `:379-386`), tylko kolor (C4); brak `aria-invalid` przy polach |
| empty | jest: `:125`, `:146`, `:344` |
| loading | SSR, formularze `method="POST"` z pełnym przeładowaniem; brak stanu „wysyłanie” na przyciskach (grep `pending|aria-busy|disabled` 0) — możliwe podwójne wysłanie |

## Code References

- `src/styles/global.css:6` — `:root` (jasne wartości, aktywne)
- `src/styles/global.css:41` — `.dark` (ciemne wartości, nieaktywne)
- `src/styles/global.css:75-111` — `@theme inline`, publikacja tokenów
- `src/styles/global.css:113` — `bg-cosmic` (literały hex gradientu)
- `src/styles/global.css:119`, `:122` — base layer: `border-border outline-ring/50`, `body bg-background`
- `src/components/ui/button.tsx:8-32` — warianty shadcn Button
- `src/pages/groups/[id].astro:55`, `:91-93` — `inputClass`, `cardClass`, `submitClass`
- `src/pages/groups/[id].astro:101` — nagłówek gradientowy
- `src/pages/groups/[id].astro:105-120`, `:206-221`, `:371-386` — komunikaty info/błąd
- `src/pages/groups/[id].astro:122-432` — kolejność sekcji
- `src/components/groups/ChildItem.tsx:11-13`, `EventItem.tsx:18-24`, `InvitePanel.tsx:13` — lokalne kopie klas przycisków/pól
- `src/components/auth/FormField.tsx`, `src/components/auth/ServerError.tsx` — istniejące, częściowo pasujące komponenty
- `src/middleware.ts:5`, `:51-53` — ochrona `/groups*`, redirect bez adresu powrotu
- `src/pages/api/auth/signin.ts:45` — po logowaniu zawsze `/dashboard` (poza `invite`)

## Architecture Insights

- Styl „cosmic” (ciemne tło, szklane karty `bg-white/10 backdrop-blur-xl`, fiolet) jest wspólny dla co najmniej: `dashboard.astro`, `404.astro`, `index.astro`, `auth/*`, `groups/*` (`bg-cosmic` w 10 plikach `src/`). To de facto design system, tylko zapisany w literałach — kontrakt powinien zmapować go na istniejące nazwy tokenów (`--primary` = fiolet, `--card` = szklana karta, `--muted-foreground` = niebieskawy wyciszony), a nie wprowadzać nowej palety.
- Zmiana tokenów w `:root`/aktywacja `.dark` wpływa globalnie: inne widoki też nadpisują Button literałami, więc nie zepsują się (literały wygrywają), ale ich wygląd się nie zmieni do czasu ich własnych zmian. Zakres tej zmiany: tokeny globalnie + ten jeden widok.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md:69` — odnotowuje frontend „shadcn/ui (button)”; brak wcześniejszych decyzji o tokenach/dark mode w `context/archive/**` i `context/changes/**` (grep `cosmic|purple-600|design token|dark mode|shadcn`: trafienia tylko w `roadmap.md` i tej zmianie).
- `context/foundation/lessons.md` — jedna lekcja (format commitów); brak lekcji UI.

## Related Research

Nie dotyczy — brak wcześniejszych `research.md` o UI.

## Open Questions

1. Aktywacja ciemnego motywu: klasa `dark` na `<html>` vs przepisanie `:root` na ciemne wartości (aplikacja nie ma przełącznika motywu) — decyzja dla `/10x-plan`.
2. Wartości tokenów: zmapować obecny fiolet/„cosmic” (`purple-600`, `white/10`, `blue-100/70`) na `--primary`/`--card`/`--muted-foreground`, czy wybrać nowe — `/10x-ui` zaleca najpierw podpiąć widok pod istniejące role, dopiero potem zmieniać wartości.
3. C5: czy przestawienie sekcji (Terminy pierwsze, admin w osobnej sekcji/`details`) i adres powrotu po logowaniu wchodzą w tę zmianę, czy zostają odroczone.
4. Do potwierdzenia zrzutem: wygląd natywnych date/time/select na ciemnym tle (C2) i fokus linków/`<summary>`.
