# Group page UI — Plan Brief

> Full plan: `context/changes/group-page-ui/plan.md`
> Research: `context/changes/group-page-ui/research.md`

## What & Why

Strona grupy `/groups/[id]` wygląda spójnie, ale jej styl żyje wyłącznie w literałach Tailwinda: tokeny shadcn istnieją, a widok nie czyta żadnego z nich, ciemny motyw nie jest aktywny, a pola i komunikaty są kopiowane ręcznie. Podpinamy widok pod kontrakt design-systemu (tokeny + komponenty w repo), żeby kolejne widoki dziedziczyły kontrakt zamiast literałów, i przestawiamy sekcje pod główny scenariusz rodzica na telefonie.

## Starting Point

Skan literałów: `[id].astro` 40 linii, `EventItem` 5, `InvitePanel` 4, `ChildItem` 3; 0 klas tokenowych. `.dark` w `global.css` nigdy nie jest włączone, więc każde z 14 użyć `<Button>` nadpisuje kolory. `src/components/ui/` ma tylko `button`. Sekcja „Administratorzy” stoi przed „Terminy”.

## Desired End State

Aplikacja działa w aktywnym trybie `dark`, a wartości tokenów odwzorowują obecny styl „cosmic”. Strona grupy zawiera tylko klasy tokenowe i komponenty `Button`/`Input`/`Card`/`Alert`, terminy są na górze, formularze admina zwinięte w „Zarządzaj terminami”. Kitchen sink `/dev/ui-group` pokazuje 7 stanów, skan literałów w `npm run lint` pilnuje kontraktu, a `AGENTS.md` mówi agentom, gdzie szukać tokenów i komponentów.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wariant kontraktu | Świeży starter z martwym plikiem tokenów | Tokeny istnieją, widok ich nie czyta — najpierw podpinamy, potem ewentualnie zmieniamy wartości | Research |
| Aktywacja ciemnego motywu | `class="dark"` na `<html>` + `color-scheme: dark` | Zachowuje układ shadcn `:root`/`.dark` i warianty `dark:`; natywne kontrolki przechodzą na ciemny schemat | Plan |
| Wartości tokenów | Obecny styl „cosmic” zmapowany na role | Wygląd prawie bez zmian, inne widoki dalej pasują; zmiana estetyki później w jednym miejscu | Plan |
| Zakres C5 | Kolejność sekcji tak; powrót po logowaniu i `/groups` odroczone | Naprawia scenariusz rodzica bez wciągania logiki auth do zmiany UI | Plan |
| Komponenty | shadcn `input`, `card`, `alert` (bez `label`) | Pokrywają C3/C4 i kartę bez nowych zależności npm | Plan |
| Stan loading / strażnik | Loading N/A (SSR); skan literałów w `npm run lint` | Błąd lintu w CI zamiast reguły, o której agent zapomni; bez nowego JS | Plan |
| Nagłówek strony | `text-foreground` zamiast gradientu | Gradient nie ma roli w tokenach — jedyna świadoma zmiana wizualna | Plan |

## Scope

**In scope:**
- Komponenty shadcn `input`, `card`, `alert`
- Wartości `.dark`, `class="dark"`, `color-scheme`, depozyt `tokens.md`
- 4 pliki widoku `/groups/[id]` na tokenach i komponentach, nowa kolejność sekcji
- Kitchen sink `/dev/ui-group` (tylko dev), focus-visible, zrzuty desktop + 360 px
- `scripts/check-ui-literals.mjs` w `npm run lint`, blok UI w `AGENTS.md`

**Out of scope:**
- Adres powrotu po logowaniu i trasa `/groups` bez id (odroczone z C5)
- Stan „wysyłanie” formularzy, nowa paleta, przełącznik motywu
- Inne widoki (dashboard, auth, plan terminu, statystyki, admin), API, baza, RLS
- shadcn `label`, Playwright, nowe zależności npm

## Architecture / Approach

Kolejność `/10x-ui`: biblioteka → tokeny → widok → stany → strażnik. `global.css` `.dark` trzyma wartości (przeniesione 1:1 z literałów), `@theme inline` je publikuje, widok używa ról (`bg-primary`, `text-muted-foreground`, `border-input`) i komponentów z `src/components/ui/`. Inne widoki nadpisują Button literałami, które wygrywają w `cn()`, więc globalna zmiana tokenów nie zmienia ich wyglądu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Komponenty shadcn | `input`, `card`, `alert` w `src/components/ui/` | CLI shadcn nadpisze `button.tsx` lub doda zależność |
| 2. Tokeny i ciemny motyw | Aktywne `.dark` z wartościami „cosmic”, `tokens.md` | Regresja w innych widokach (elementy bez jawnego koloru) |
| 3. Widok na tokenach | 4 pliki bez literałów, nowa kolejność sekcji | Zgubione kotwice komunikatów `#terminy`/`#dzieci` |
| 4. Stany i kitchen sink | `/dev/ui-group`, focus-visible, zrzuty | Kitchen sink dostępny w produkcji |
| 5. Strażnik kontraktu | Skan w `npm run lint`, blok UI w `AGENTS.md` | Fałszywe trafienia regexu blokujące lint |

**Prerequisites:** branch z `main` (folder zmiany jest dziś nieśledzony); `npx supabase start` i `npm run dev` do weryfikacji manualnej; konto admina i zwykłego członka w jednej grupie.
**Estimated effort:** ~2–3 sesje, 5 faz.

## Open Risks & Assumptions

- Zakładam, że żaden inny widok nie polega na jasnych wartościach `:root` (np. element z samym `border` bez koloru) — weryfikacja manualna 2.6.
- Wygląd natywnych pól date/time po `color-scheme: dark` zależy od przeglądarki — sprawdzany w Chrome (2.7).
- Kolory `bg-primary/90` przy hover różnią się minimalnie od dawnego `purple-500` — akceptowana różnica.

## Success Criteria (Summary)

- Rodzic na telefonie widzi najbliższe terminy jako pierwszą kartę, a komunikaty po akcjach pojawiają się w miejscu akcji, z ikoną, nie tylko kolorem.
- Strona grupy nie zawiera literałów kolorów; `npm run lint` pilnuje tego w CI.
- Następny agent znajduje w `AGENTS.md` wskazówkę, gdzie są tokeny, komponenty i kitchen sink.
