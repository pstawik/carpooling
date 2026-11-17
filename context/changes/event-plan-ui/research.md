---
date: 2026-11-17 (godzina nieznana — Bash niedostępny w tej sesji)
researcher: Claude Code (claude-opus-5-5)
git_commit: 4c12d5b
branch: main
repository: carpooling
topic: "Audyt UI widoku /groups/[id]/terminy/[eventId] względem kontraktu design-systemu (tokeny + komponenty)"
tags: [research, ui, design-tokens, shadcn, event-plan, 10x-ui]
status: complete
last_updated: 2026-11-17
last_updated_by: Claude Code (claude-opus-5-5)
---

# Research: Audyt UI widoku planu terminu

**Date**: 2026-11-17
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: 4c12d5b
**Branch**: main
**Repository**: carpooling
**Issue**: https://github.com/pstawik/carpooling/issues/45

## Research Question

Dwukierunkowy audyt widoku `/groups/[id]/terminy/[eventId]` (`src/pages/groups/[id]/terminy/[eventId].astro`, jeden plik, bez komponentów potomnych poza `Topbar` i `Button`), zgodnie z `/10x-ui`:

1. **Źródło → widok:** które tokeny z `src/styles/global.css` i komponenty z `src/components/ui/` oraz `src/components/groups/group-page-classes.ts` widok czyta.
2. **Widok → źródło:** jaki token/komponent powinien pokryć każdy literał (31 linii ze skanu).
3. **Architektura:** wejścia (wylogowany, nie-członek, błąd ładowania, termin rozpoczęty, brak kierowców/dzieci), kolejność sekcji względem US-01 na 360 px, kitchen sink.

Wynik: 3–5 zarzutów z `plik:linia` i skutkiem dla użytkownika (`## Charges`).

## Summary

- **Wariant kontraktu: istniejący design system.** Tokeny `.dark` są aktywne i zmapowane z palety „cosmic” (`global.css:42-77`, źródło `context/archive/2026-11-16-group-page-ui/tokens.md`), komponenty `card`, `alert`, `input`, `button` są w `src/components/ui/`, a sąsiedni widok `/groups/[id]` je czyta (`[id].astro:18-21`, stałe z `group-page-classes.ts:8-36`). Ten widok nie został przeniesiony: 0 linii z klasą tokenową, z `ui/` importuje tylko `Button` (`[eventId].astro:4`) i każde z 4 użyć nadpisuje go literałami (`:191`, `:200`, `:238-241`).
- **Skan literałów:** 31 linii z trafieniem (wzorzec `/10x-ui`, skrypt node na pliku widoku, 2026-11-17); widoku nie ma w `CLEANED_VIEWS` (`scripts/check-ui-literals.mjs:10-18`).
- **Nie trzeba nowych wartości kolorów poza jednym przypadkiem:** każdy literał w widoku ma odpowiednik w istniejących rolach (`--card`, `--primary`, `--secondary`/`outline`, `--muted-foreground`, `--input`, `--ring`, `--link`, `--destructive`) — z wyjątkiem zielonego „Miejsc wystarcza” (`:143`): w `global.css:6-77` nie ma tokenu `success`/`warning`.
- **Architektura:** kolejność sekcji (bilans → mój przejazd → moje dzieci → kierowcy → plan dzieci) stawia deklarację dziecka — pierwszy krok US-01 (`prd.md:66`) — na trzecim miejscu, pod formularzem kierowcy. Rodzic bez dzieci w grupie nie widzi sekcji „Twoje dzieci” ani wskazówki, jak dodać dziecko (`:209`). Widok nie ma kitchen sinka.

## Charges

Każdy zarzut: dowód (`plik:linia`, wszystkie w `src/pages/groups/[id]/terminy/[eventId].astro`, chyba że podano inaczej) → co powinno go pokryć → skutek dla użytkownika.

### C1 — Brakujące tokeny: kolory wpisane na sztywno mimo istniejących ról (missing tokens)

- **Dowód:**
  - karta `border-white/10 bg-white/10 … text-white` — `:90` (`cardClass`, 6 sekcji: `:124`, `:131`, `:152`, `:210`, `:255`, `:281`);
  - akcja główna `bg-purple-600 hover:bg-purple-500` i `text-white` — `:92-93`;
  - akcja drugorzędna `border-white/20 bg-white/10 hover:bg-white/20` — `:94`, link powrotu `:322`;
  - nagłówek gradientowy `from-blue-200 to-purple-200 … text-transparent` — `:108` (widok grupy ma `text-foreground`, `[id].astro:108`);
  - tekst wyciszony `text-blue-100/70` — `:107`, `:148`, `:164`, `:218`, `:225`, `:258`, `:265`, `:287`, `:293`, `:303`, `:309`; `text-blue-100/80` — `:95`, `:111`, `:175`, `:285`, `:301`;
  - link telefonu `text-blue-200` — `:270`;
  - pole `border-white/20 bg-white/10 … focus:ring-purple-400` — `:98`.
- **Co powinno pokryć:** `--card`/`--border` (przez `Card`), `--primary` (Button `default`, `button.tsx:12`), wariant `outline` (`button.tsx:16`), `--muted-foreground`, `--foreground`, `--link` (`global.css:63`), `--input`/`--ring` (przez `Input`) — wszystkie opublikowane w `@theme inline` (`global.css:79-116`).
- **Skutek dla użytkownika:** rodzic przechodzi z widoku grupy do planu terminu jednym kliknięciem (`[id].astro:170`), a dostaje inny odcień fioletu (`purple-600` z literału vs `--primary`), inny nagłówek (gradient vs biały) i inny kolor linku (`blue-200` vs `--link`); każda przyszła zmiana tokenu ominie ten widok.

### C2 — Brakujący komponent współdzielony: komunikaty i ostrzeżenie o niedoborze bez `Alert` (missing shared component)

- **Dowód:**
  - blok błędu `border-red-500/30 bg-red-900/30 … text-red-300` zbudowany ręcznie: `:96` (`alertClass`, użyty `:155`, `:213`), kopia wpisana inline `:116`, kopia dla niedoboru `:136`;
  - błąd ładowania planu to sam tekst `text-red-300` w karcie — `:125-127` (widok grupy: `Alert variant="destructive"` z ikoną, `[id].astro:142-145`);
  - „Miejsc wystarcza” `border-green-500/30 bg-green-900/30 text-green-300` — `:143`; w `global.css:6-77` brak tokenu sukcesu;
  - w żadnym z tych bloków nie ma ikony (`lucide-react` nieimportowany, `:1-14`); widok grupy używa `CircleAlert`/`Info` (`[id].astro:2`, `:118`).
- **Co powinno pokryć:** `Alert`/`AlertDescription` (`src/components/ui/alert.tsx:5-23`) z wariantem `destructive` + `CircleAlert` dla błędów i niedoboru; dla „Miejsc wystarcza” — `Alert` `default` z ikoną sukcesu albo nowy token — decyzja w `/10x-plan` (Open Questions 1).
- **Skutek dla użytkownika:** ostrzeżenie o niedoborze miejsc — główna informacja planu (FR-016, `prd.md:108`) — i komunikat „Miejsc wystarcza” różnią się kolorem tła i tekstem, ale nie ikoną; błąd ładowania planu wygląda jak zwykły czerwony akapit, inaczej niż ten sam rodzaj błędu na stronie grupy.

### C3 — Brakujący komponent współdzielony: `Card`, `Input` i stałe z `group-page-classes.ts` skopiowane lokalnie (missing shared component)

- **Dowód:**
  - lokalne `cardClass` (`:90`) zamiast `Card` + `cardClass` z `group-page-classes.ts:32`;
  - natywny `<input>` z lokalnym `inputClass` (`:98`, `:178-190`) zamiast `Input` (`ui/input.tsx:4-18`) + `inputClass` (`group-page-classes.ts:9`); fokus na `:focus` z literałem `ring-purple-400`, nie `:focus-visible` z `--ring` (`ui/input.tsx:11`);
  - etykieta `block text-sm text-blue-100/80` (`:175`) zamiast `labelClass` (`group-page-classes.ts:15`);
  - `choiceClass` (`:91-92`) powiela `submitClass` (`group-page-classes.ts:34`: `h-auto min-h-11 w-full whitespace-normal`) i dokłada `text-white`, `rounded-lg`, `px-3`;
  - link „Wróć do grupy” (`:320-325`) to ręczna kopia `linkButtonClass` (`group-page-classes.ts:36`);
  - plakietka „bez deklaracji” (`:95`, `:310`) bez komponentu — w `src/components/ui/` nie ma `badge` (listing: `alert`, `button`, `card`, `input`, `LibBadge.astro`);
  - błąd `invalid_driver_seats` jest pokazany nad formularzem (`:154-158`, przekierowanie `api/groups/events/driver.ts:38`, `:54`), ale pole `#driver-seats` nie dostaje `aria-invalid` ani `aria-describedby` (`:178-190`).
- **Co powinno pokryć:** `Card`, `Input`, stałe z `group-page-classes.ts`, `Button` bez nadpisań kolorów (`default` / `variant="outline"`); `npx shadcn@latest add badge` dla plakietki.
- **Skutek dla użytkownika:** użytkownik klawiatury widzi na polu miejsc inną obwódkę fokusu (fiolet z literału, także przy kliknięciu myszą) niż na pozostałych kontrolkach; czytnik ekranu po błędzie „Podaj liczbę miejsc od 1 do 8” nie wiąże go z polem.

### C4 — Nieprzypadkowa architektura: kolejność sekcji odpowiada kolejności dodawania funkcji, nie US-01 (accidental architecture)

- **Dowód:** `#bilans` (`:131`) → `#twoj-przejazd` (`:152`, formularz kierowcy `:171-194`) → `#twoje-dzieci` (`:210`) → `#kierowcy` (`:255`) → „Plan dzieci” (`:281`). US-01: „ustawiam dziecku »jedzie« i otwieram plan terminu” (`prd.md:66`). Kolejność pokrywa się z kolejnością zmian w archiwum (`child-attendance-declaration` 2026-11-13, potem `driver-declaration-seat-balance` 2026-11-13, które dodało bilans i przejazd na górze) — inferencja z nazw folderów `context/archive/`, kolejność w obrębie dnia nieustalona.
- Sekcje nie mają `role="region"`/`aria-labelledby` (widok grupy ma: `[id].astro:123`, `:299`, `:373`).
- **Skutek dla użytkownika:** na 360 px rodzic, który chce tylko zaznaczyć „jedzie”, przewija bilans i cały formularz kierowcy (pole + 1–2 przyciski); lista „kto jedzie” (plan dzieci) jest na samym dole, oddzielona od bilansu dwiema sekcjami. Przekierowania po akcji kotwiczą przewinięcie (`attendance.ts:60` → `#twoje-dzieci`, `driver.ts:93` → `#twoj-przejazd`), więc przestawienie sekcji nie psuje powrotu po zapisie.
- **Status:** do decyzji w `/10x-plan` (Open Questions 2) — zmiana układu jest w zakresie `/10x-ui`, ale zmienia przyzwyczajenia użytkowników.

### C5 — Nieprzypadkowa architektura: stany puste, zablokowane i bez kitchen sinka (accidental architecture)

- **Dowód:**
  - rodzic bez dzieci w grupie: sekcja „Twoje dzieci” znika (`:209` `plan.mine.length > 0`), brak wskazówki i linku do `/groups/[id]#dzieci`;
  - termin rozpoczęty: przyciski i pole są usuwane z DOM (`:159-167`, `:217-219`, `:227`), zostaje tekst „tylko do odczytu” (`:164-166`, `:218`); stanu `disabled` w widoku nie ma (brak atrybutu `disabled` w `:1-328`);
  - błąd ładowania (`:123-128`) zastępuje wszystkie sekcje jednym akapitem; link „Wróć do grupy” zostaje (`:320`);
  - po udanej deklaracji brak komunikatu — endpointy przekierowują bez `?message` (`attendance.ts:60`, `driver.ts:93`); potwierdzeniem jest zmiana statusu (`:225`) i `aria-pressed` (`:240`);
  - kitchen sink `/dev/ui-group` pokazuje tylko elementy widoku grupy (`src/pages/dev/ui-group.astro:23`); dla tego widoku nie ma żadnego.
  - wejścia poprawne (bez zarzutu): wylogowany → middleware przekierowuje na logowanie (`middleware.ts:5`, `:51`); nie-członek, termin innej grupy, nieznane id → ten sam 404 (`:21-32`). Brak adresu powrotu po logowaniu — odroczone już w `group-page-ui` (`context/archive/2026-11-16-group-page-ui/research.md:98-100`).
- **Skutek dla użytkownika:** nowy członek, który otworzy plan z linku na czacie, zanim doda dziecko, nie dowie się z tego ekranu, gdzie zadeklarować dziecko. Stanów `disabled`/`error`/`empty` nie da się sprawdzić bez przygotowania danych w bazie, więc regresje w nich przejdą niezauważone.

## Detailed Findings

### Źródło → widok

- Tokeny: `.dark` zawsze aktywne (`src/layouts/Layout.astro:14` `<html lang="pl" class="dark">`), wartości w `global.css:43-77`, publikacja `global.css:79-116`; nowy `--link` (`global.css:26`, `:63`, `:102`).
- Klasy tokenowe w widoku: 0 linii (`bg|text|border|ring-(primary|secondary|muted|accent|destructive|card|foreground|background|input|ring|popover)` i `muted-foreground`; skrypt node 2026-11-17).
- Importy z `src/components/ui/`: 1 (`Button`, `:4`); z `group-page-classes.ts`: 0. Widok grupy dla porównania: 4 importy z `ui/` i 8 stałych (`[id].astro:8-21`).
- `Topbar` już oczyszczony (`CLEANED_VIEWS`, `check-ui-literals.mjs:16`).

### Widok → źródło (baseline 7 stanów)

| Stan | Stan obecny w widoku |
| --- | --- |
| default | literały palety (C1), 0 tokenów |
| hover | literały: `hover:bg-purple-500` (`:93`), `hover:bg-white/20` (`:94`, `:322`), `hover:underline` (`:270`) |
| focus-visible | `Button`: `focus-visible:ring-ring` z `button.tsx:8`; pole: `focus:ring-purple-400` (`:98`); link telefonu i „Wróć do grupy”: brak własnego stylu, globalne `outline-ring/50` (`global.css:124`) — inferencja, do zrzutu |
| disabled | brak; kontrolki są ukrywane po starcie terminu (C5) |
| error | komunikaty z `?error=` (`:41-45`) w ręcznych blokach (C2); pole bez `aria-invalid` (C3) |
| empty | są komunikaty: brak kierowców `:258`, nikt nie jedzie `:148`, `:287`, pusta lista niejadących `:303`; brak dzieci rodzica — sekcja znika (C5) |
| loading | SSR, formularze `method="POST"` z pełnym przeładowaniem — N/A jak w `group-page-ui` (`ui-group.astro:265-273`) |

### Mapowanie kodów błędów na miejsce wyświetlenia

- `not_configured`, `unknown` → góra strony (`:45`, `:114-121`);
- `driver_locked`, `invalid_driver_seats` → `#twoj-przejazd` (`:43-44`, `:154-158`; `driver.ts:38`, `:54`, `:86`);
- `attendance_locked` → `#twoje-dzieci` (`:42`, `:212-216`; `attendance.ts:50`). Gdy rodzic nie ma dzieci, sekcja się nie renderuje, ale ten kod może wtedy nie wystąpić (RLS odrzuca cudze dziecko jako 404, `attendance.ts:52`) — inferencja z kodu.

## Code References

- `src/pages/groups/[id]/terminy/[eventId].astro:90-98` — lokalne stałe klas (karta, przyciski, plakietka, alert, pole)
- `src/pages/groups/[id]/terminy/[eventId].astro:106-112` — nagłówek z gradientem
- `src/pages/groups/[id]/terminy/[eventId].astro:114-150` — błąd ogólny, błąd ładowania, bilans (niedobór/wystarcza/nikt)
- `src/pages/groups/[id]/terminy/[eventId].astro:152-207` — „Twój przejazd”, formularz kierowcy
- `src/pages/groups/[id]/terminy/[eventId].astro:209-253` — „Twoje dzieci”, przyciski Jedzie/Nie jedzie
- `src/pages/groups/[id]/terminy/[eventId].astro:255-316` — kierowcy, plan dzieci
- `src/pages/groups/[id]/terminy/[eventId].astro:320-325` — „Wróć do grupy”
- `src/components/groups/group-page-classes.ts:8-36` — wspólne stałe do ponownego użycia
- `src/components/ui/alert.tsx`, `card.tsx`, `input.tsx`, `button.tsx` — komponenty kontraktu
- `src/styles/global.css:43-77`, `:79-116` — wartości `.dark` i publikacja
- `src/pages/api/groups/events/attendance.ts:50`, `:60`; `driver.ts:38`, `:54`, `:86`, `:93` — przekierowania z kotwicami
- `src/pages/dev/ui-group.astro` — wzorzec kitchen sinka
- `scripts/check-ui-literals.mjs:10-18` — `CLEANED_VIEWS`

## Architecture Insights

- Kontrakt ustalony w `group-page-ui` wystarcza dla tego widoku; zmiana to głównie podpięcie widoku pod istniejące tokeny i komponenty, bez nowej palety. Jedyny kandydat na nową wartość to rola „sukces”.
- `group-page-classes.ts` z nazwy dotyczy widoku grupy, a po tej zmianie użyją go dwa widoki. Zmiana nazwy pliku dotknęłaby `[id].astro`, `ui-group.astro` i `CLEANED_VIEWS` — poza minimalnym zakresem; do decyzji w planie.
- Widok jest czysto SSR (bez wysp React), więc 7-stanowy kitchen sink można zbudować w Astro jak `ui-group.astro`, z danymi wpisanymi w stronę.

## Historical Context (from prior changes)

- `context/archive/2026-11-16-group-page-ui/change.md:14` — plan terminu wyłączony z zakresu jako „osobna zmiana” (supported: ta zmiana).
- `context/archive/2026-11-16-group-page-ui/reviews/impl-review.md:128` — wskazuje `terminy/[eventId].astro` jako naturalny kolejny wpis w `CLEANED_VIEWS` (supported).
- `context/archive/2026-11-16-group-page-ui/research.md:73` — literał `focus:ring-purple-400` w `terminy/[eventId].astro` (supported: nadal `:98`).
- `context/archive/2026-11-16-group-page-ui/research.md:98-100` — adres powrotu po logowaniu odroczony (nadal aktualne, poza zakresem).
- `context/archive/2026-11-16-group-page-ui/tokens.md` — mapowanie literałów „cosmic” na role `.dark`; te same literały występują w tym widoku.

## Related Research

- `context/archive/2026-11-16-group-page-ui/research.md` — audyt widoku grupy (wzorzec zarzutów i kontraktu).

## Open Questions

1. „Miejsc wystarcza” (`:143`): nowy token `--success` w `:root`/`.dark` + `@theme inline`, czy `Alert` `default` z ikoną `CircleCheck` bez nowego koloru?
2. C4: przestawić sekcje (np. bilans → twoje dzieci → plan dzieci → twój przejazd → kierowcy) w tej zmianie, czy odroczyć?
3. Termin rozpoczęty: zostawić ukrywanie kontrolek (stan `disabled` = N/A z powodem), czy pokazywać je wyłączone?
4. Kitchen sink: nowa strona `/dev/ui-event` (zalecane — osobny widok, osobny zrzut) czy rozszerzenie `/dev/ui-group`?
5. Do potwierdzenia zrzutem: fokus linku telefonu i „Wróć do grupy”, wygląd natywnego `type="number"` na ciemnym tle.
