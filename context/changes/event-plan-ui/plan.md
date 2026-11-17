# Event plan UI — plan implementacji

## Overview

Przenosimy widok planu terminu `/groups/[id]/terminy/[eventId]` na kontrakt design-systemu, z którego korzysta już widok grupy: tokeny z `src/styles/global.css`, komponenty z `src/components/ui/` i stałe z `src/components/groups/group-page-classes.ts`. Dodajemy rolę `--success` dla „Miejsc wystarcza”, przestawiamy sekcje pod scenariusz US-01, budujemy kitchen sink `/dev/ui-event` i dopisujemy widok do `CLEANED_VIEWS`. Issue: https://github.com/pstawik/carpooling/issues/45

## Current State Analysis

- Widok (`src/pages/groups/[id]/terminy/[eventId].astro`, 328 linii) ma 31 linii z literałami palety i 0 klas tokenowych; z `ui/` importuje tylko `Button` (`:4`) i nadpisuje go przy każdym użyciu (`:191`, `:200`, `:238-241`) — research C1.
- Komunikaty błędów i ostrzeżenie o niedoborze to ręczne bloki `red-*` (`:96`, `:116`, `:136`), „Miejsc wystarcza” to `green-*` (`:143`), błąd ładowania to akapit (`:125`) — C2. W `global.css` nie ma roli sukcesu.
- Lokalne `cardClass`/`inputClass`/`choiceClass`, etykieta, link powrotu i plakietka powielają `Card`, `Input`, `group-page-classes.ts` (`:90-98`, `:175`, `:320-325`); brak `ui/badge`; pole miejsc bez `aria-invalid` przy błędzie `invalid_driver_seats` — C3.
- Kolejność sekcji: bilans → twój przejazd → twoje dzieci → kierowcy → plan dzieci (`:131`, `:152`, `:210`, `:255`, `:281`); sekcje bez `role="region"` — C4.
- Rodzic bez dzieci nie widzi sekcji „Twoje dzieci” ani wskazówki (`:209`); brak kitchen sinka — C5.

## Desired End State

- Widok czyta wyłącznie tokeny i komponenty repo; `node scripts/check-ui-literals.mjs` (w `npm run lint`) zwraca 0 trafień z widokiem i `/dev/ui-event` na liście `CLEANED_VIEWS`.
- Kolejność: Bilans → Twoje dzieci → Plan dzieci → Twój przejazd → Kierowcy → „Wróć do grupy”. Każda sekcja to `Card` z `role="region"` i `aria-labelledby`.
- Błędy, niedobór i błąd ładowania przez `Alert variant="destructive"` z ikoną `CircleAlert`; „Miejsc wystarcza” przez `Alert variant="success"` z ikoną `CircleCheck`, kolor z `--success`.
- Rodzic bez dzieci w grupie widzi w karcie `#twoje-dzieci` wskazówkę z linkiem do `/groups/[id]#dzieci`.
- `/dev/ui-event` pokazuje 7 stanów (disabled i loading jako N/A z powodem, plus stan „termin się rozpoczął”), zrzuty na desktopie i 360 px.

### Key Discoveries:

- Tokeny `.dark` aktywne zawsze: `src/layouts/Layout.astro:14`; wartości `global.css:43-77`, publikacja `global.css:79-116`.
- Wzorzec widoku na kontrakcie: `src/pages/groups/[id].astro:18-21`, `:111-121`, `:123`; stałe `group-page-classes.ts:8-36`.
- Wzorzec kitchen sinka: `src/pages/dev/ui-group.astro` (dev-only guard `:25-27`, karta na stan).
- Przekierowania kotwiczą do `#twoje-dzieci` (`api/groups/events/attendance.ts:50`, `:60`) i `#twoj-przejazd` (`driver.ts:38`, `:54`, `:86`, `:93`) — id sekcji muszą zostać.
- `components.json` ma alias `utils: "@/lib/utils"`, ale AGENTS.md ostrzega, że CLI wstawia import pakietu `cn` — po `shadcn add` przepiąć import ręcznie.
- Odpowiednik literałów zielonych: `text-green-300` na `bg-green-900/30` (`:143`); analogicznie do `--destructive` (red-400 zamiast red-300) bierzemy green-400.

## What We're NOT Doing

- Zmiany w API, bazie, RLS, kodach błędów i treściach komunikatów (`group-errors.ts`).
- Pokazywanie kontrolek jako `disabled` po starcie terminu — zostaje ukrywanie (decyzja planu); `disabled` w macierzy = N/A z powodem.
- Komunikat potwierdzenia po udanej deklaracji (endpointy nie wysyłają `?message`) — potwierdzeniem pozostaje status i `aria-pressed`.
- Adres powrotu po logowaniu (odroczony w `group-page-ui`) i inne widoki (statystyki, dashboard, admin).
- Zmiana nazwy `group-page-classes.ts`, mimo że użyją go dwa widoki.
- Testy zrzutowe w Playwright (repo ich nie ma) — bramką jest kitchen sink + zrzuty.

## Implementation Approach

Kolejność `/10x-ui`: biblioteka → wartości tokenów → jeden widok → stany i strażnik. Faza 1 i 2 dodają `Badge` i rolę `--success` bez użycia w widoku. Faza 3 przepina widok — wizualnie prawie neutralnie (wartości tokenów `.dark` są zmapowane z tych samych literałów w `group-page-ui/tokens.md`), świadome zmiany to: nagłówek z gradientu na `text-foreground`, ikony w komunikatach, nowa kolejność sekcji, wskazówka dla rodzica bez dzieci. Faza 4 domyka macierz stanów i utrwala kontrakt.

## Critical Implementation Details

- **Kotwice i komunikaty:** `id="twoje-dzieci"` i `id="twoj-przejazd"` zostają na kartach; `lockedError` renderowany bezpośrednio pod nagłówkiem `#twoje-dzieci`, `driverError` pod nagłówkiem `#twoj-przejazd`. Karta `#twoje-dzieci` renderuje się zawsze (z listą albo ze wskazówką), żeby kotwica i `lockedError` nie trafiały w próżnię.
- **Wspólne stałe:** każda stała klas potrzebna i w widoku, i w `/dev/ui-event` trafia do `group-page-classes.ts` (lekcja F5 z `group-page-ui`: sink nie kopiuje stałych).

## Faza 1: Komponent Badge

### Overview

Dodajemy brakujący komponent plakietki ścieżką stacku (C3). Bez użycia w widoku.

### Changes Required:

#### 1. Badge

**File**: `src/components/ui/badge.tsx`

**Intent**: Dodać `Badge` przez `npx shadcn@latest add badge`, żeby „bez deklaracji” miało komponent zamiast lokalnego `badgeClass`.

**Contract**: Plik generowany przez CLI (styl `new-york`); jedyna ręczna zmiana to import `cn` z `@/lib/utils`. `package.json` i lockfile bez nowych zależności (`@radix-ui/react-slot` i `class-variance-authority` już są).

### Success Criteria:

#### Automated Verification:

- Plik `src/components/ui/badge.tsx` istnieje i importuje `cn` z `@/lib/utils`
- `git diff --stat package.json package-lock.json` jest pusty
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów

**Implementation Note**: Po zielonej weryfikacji automatycznej — commit, potem faza 2 (brak kroków manualnych).

---

## Faza 2: Rola `--success`

### Overview

Dodajemy rolę sukcesu do systemu tokenów i wariant `success` do `Alert` (C2).

### Changes Required:

#### 1. Wartości tokenu

**File**: `src/styles/global.css`

**Intent**: Dodać `--success` i `--success-foreground` w `:root` i `.dark` oraz opublikować je w `@theme inline`, z komentarzem wskazującym źródło (`context/changes/event-plan-ui/tokens.md`).

**Contract**:
- `:root`: `--success: oklch(0.627 0.194 149.214)` (green-600), `--success-foreground: oklch(0.985 0 0)`
- `.dark`: `--success: oklch(0.792 0.209 151.711)` (green-400, czytelne na ciemnym tle, jak `--destructive` = red-400), `--success-foreground: oklch(0.145 0 0)`
- `@theme inline`: `--color-success: var(--success)`, `--color-success-foreground: var(--success-foreground)` — bez surowych kolorów w `@theme inline`.

#### 2. Wariant Alert

**File**: `src/components/ui/alert.tsx`

**Intent**: Dodać wariant `success` analogiczny do `destructive`, żeby „Miejsc wystarcza” nie wymagało klas w widoku.

**Contract**: `variant: "success"` → `bg-card text-success *:data-[slot=alert-description]:text-success/90 [&>svg]:text-current`; warianty `default` i `destructive` bez zmian.

#### 3. Depozyt wartości

**File**: `context/changes/event-plan-ui/tokens.md` (nowy)

**Intent**: Zapisać tabelę token → wartość (`:root`/`.dark`) → literał źródłowy → plik:linia.

**Contract**: Jedna tabela Markdown z wierszami `--success`, `--success-foreground`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `global.css` zawiera `--color-success: var(--success)` w `@theme inline` i `--success` w `:root` oraz `.dark`

#### Manual Verification:

- Kontrast `text-success` na `bg-card` nad `bg-cosmic` jest czytelny (sprawdzenie w DevTools lub na zrzucie z fazy 4)

**Implementation Note**: Po zielonej weryfikacji automatycznej — commit; kontrast potwierdzić najpóźniej przy zrzutach w fazie 4.

---

## Faza 3: Widok na tokenach i komponentach

### Overview

Przepinamy `[eventId].astro` na tokeny i komponenty, przestawiamy sekcje i domykamy dostępność pola miejsc (C1–C5).

### Changes Required:

#### 1. Strona planu terminu

**File**: `src/pages/groups/[id]/terminy/[eventId].astro`

**Intent**: Usunąć lokalne `cardClass`, `choiceClass`, `choiceOnClass`, `choiceOffClass`, `badgeClass`, `alertClass`, `inputClass`; zastąpić je komponentami `Card`, `Alert`/`AlertDescription`, `Input`, `Button`, `Badge` i stałymi z `group-page-classes.ts`; literały kolorów — klasami tokenowymi; przestawić sekcje.

**Contract**:
- Kolejność: `#bilans` → `#twoje-dzieci` → Plan dzieci (`#plan-jada`, `#plan-nie-jada` w środku) → `#twoj-przejazd` → `#kierowcy` → „Wróć do grupy”. Każda karta: `Card` z `cardClass`, `role="region"`, `aria-labelledby` na id nagłówka `h2`; `scroll-mt-4` na kartach z kotwicą przekierowania.
- Nagłówek: nazwa grupy `text-muted-foreground`, `h1` `text-foreground` (bez gradientu), notatka `text-muted-foreground`.
- `error` (góra strony), `driverError`, `lockedError`, błąd ładowania planu, niedobór miejsc: `Alert variant="destructive"` + `CircleAlert`, z zachowanym `role="alert"`; „Miejsc wystarcza”: `Alert variant="success"` + `CircleCheck` (`role="status"`); „Żadne dziecko jeszcze nie jedzie” — tekst `text-muted-foreground`.
- Przyciski Jedzie/Nie jedzie: `Button` (`default` dla wybranej opcji, `variant="outline"` dla drugiej), `className={submitClass}`, zachowane `aria-pressed`; „Jadę jako kierowca”/„Zapisz miejsca” — `default`; „Wycofaj” — `outline`.
- Pole miejsc: `Input` z `inputClass`, etykieta `labelClass`; przy `driverError === invalid_driver_seats` pole dostaje `aria-invalid="true"` i `aria-describedby` na id komunikatu.
- „bez deklaracji”: `Badge variant="secondary"` (lub `outline`, zależnie od czytelności na `bg-card`).
- Telefon kierowcy: `text-link` + `focusRingClass`, `min-h-11`; „Wróć do grupy”: `linkButtonClass`.
- Rodzic bez dzieci: karta `#twoje-dzieci` z tekstem `text-muted-foreground` i linkiem (`planLinkClass` lub `text-link`) do `/groups/${group.id}#dzieci`.
- Zachowane bez zmian: nazwy pól, `action`, hidden inputs, logika `locked`/ukrywania kontrolek, ochrona 404, mapowanie kodów błędów (`:41-45`).

#### 2. Wspólne stałe

**File**: `src/components/groups/group-page-classes.ts`

**Intent**: Dopisać stałe potrzebne i widokowi, i `/dev/ui-event` (np. klasa listy dzieci/kierowców `rounded-xl border bg-…`), jeśli takie powstaną; komentarz modułu wymienia oba widoki.

**Contract**: Tylko klasy tokenowe; istniejące eksporty bez zmian.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan z `/10x-ui` na `[eventId].astro` zwraca 0 trafień (było 31)
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi

#### Manual Verification:

- Na 360 px i desktopie: kolejność Bilans → Twoje dzieci → Plan dzieci → Twój przejazd → Kierowcy, bez przewijania w poziomie, kontrolki ≥ 44 px
- Zaznaczenie „Jedzie”/„Nie jedzie” wraca do `#twoje-dzieci`, zapis kierowcy i „Wycofaj” do `#twoj-przejazd`; komunikat błędu widoczny po skoku bez przewijania
- Liczba miejsc 0 lub 9 (przez DevTools) pokazuje „Podaj liczbę miejsc od 1 do 8” przy polu, pole ma `aria-invalid`
- Niedobór, „Miejsc wystarcza” i „Żadne dziecko jeszcze nie jedzie” wyglądają poprawnie i różnią się ikoną, nie tylko kolorem
- Konto bez dzieci w grupie widzi wskazówkę z działającym linkiem do `/groups/[id]#dzieci`
- Termin rozpoczęty: brak kontrolek, widoczny tekst „tylko do odczytu”

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 4.

---

## Faza 4: Stany, kitchen sink i strażnik

### Overview

Domykamy macierz 7 stanów w kitchen sinku i utrwalamy kontrakt w lincie oraz `AGENTS.md`.

### Changes Required:

#### 1. Kitchen sink

**File**: `src/pages/dev/ui-event.astro` (nowy)

**Intent**: Strona dev-only wzorowana na `ui-group.astro`, z danymi wpisanymi w stronę, pokazująca elementy planu terminu w 7 stanach.

**Contract**:
- Guard `if (!import.meta.env.DEV) return Astro.rewrite("/404")`; brak zapytań do Supabase.
- Karty stanów: **default** (bilans: niedobór i „Miejsc wystarcza”, dziecko z przyciskami Jedzie/Nie jedzie, formularz kierowcy, kierowca z telefonem, plan z plakietką „bez deklaracji”), **hover**, **focus-visible** (Tab po przyciskach, polu, linku telefonu, „Wróć do grupy”), **disabled** (N/A z powodem: po starcie terminu kontrolki są ukrywane — pokazany stan „termin się rozpoczął”), **error** (`invalid_driver_seats` z `aria-invalid`, `attendance_locked`, `unknown`, błąd ładowania planu), **empty** (brak kierowców, nikt nie jedzie, rodzic bez dzieci ze wskazówką), **loading** (N/A — SSR).
- Klasy wyłącznie z `group-page-classes.ts` i tokenów.

#### 2. Strażnik lintu

**File**: `scripts/check-ui-literals.mjs`

**Intent**: Dopisać `src/pages/groups/[id]/terminy/[eventId].astro` i `src/pages/dev/ui-event.astro` do `CLEANED_VIEWS`.

**Contract**: Dwa nowe wpisy w tablicy `CLEANED_VIEWS`; logika skryptu bez zmian.

#### 3. Reguła dla agentów

**File**: `AGENTS.md`

**Intent**: W sekcji `### UI` dopisać kitchen sink `/dev/ui-event` obok `/dev/ui-group` i wzmiankę o roli `--success` (wariant `Alert` `success`).

**Contract**: Edycja istniejących punktów sekcji `### UI`; bez nowej sekcji, poza blokiem `<!-- BEGIN @przeprogramowani/10x-cli -->`, jeśli istnieje.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi (w tym `check-ui-literals: 0 hits in 9 files`)
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `npm run smoke` przechodzi na uruchomionym serwerze

#### Manual Verification:

- `/dev/ui-event` pokazuje wszystkie 7 stanów (lub N/A z powodem); zrzuty na desktopie i 360 px
- focus-visible: każdy przycisk, pole i link ma obwódkę w kolorze `--ring`; kliknięcie myszą nie pokazuje obwódki na linkach
- Kontrast `--success` i plakietki „bez deklaracji” czytelny na zrzutach

**Implementation Note**: Po zielonej weryfikacji automatycznej i potwierdzeniu zrzutów — commit, potem `/10x-impl-review event-plan-ui`.

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych w repo (AGENTS.md) — weryfikacja przez lint, `astro check`, build, smoke.

### Integration Tests:

- `npm run smoke` (przepływ auth) na uruchomionym serwerze w fazie 4.

### Manual Testing Steps:

1. Otwórz plan nadchodzącego terminu jako rodzic z dzieckiem: zaznacz „Jedzie”, sprawdź powrót do `#twoje-dzieci` i zmianę bilansu.
2. Zadeklaruj się jako kierowca z 3 miejscami, zmień na 1, wycofaj; sprawdź powrót do `#twoj-przejazd`.
3. Wyślij liczbę miejsc spoza 1–8 (DevTools): komunikat przy polu, `aria-invalid`.
4. Otwórz plan jako członek bez dzieci: wskazówka i link do `#dzieci`.
5. Otwórz plan rozpoczętego terminu: brak kontrolek, tekst „tylko do odczytu”.
6. Otwórz `/dev/ui-event` na desktopie i 360 px, przejdź Tabem po wszystkich kontrolkach.

## Performance Considerations

Brak — zmiana wyłącznie w markupie SSR i CSS; `Badge`, `Alert`, `Card` renderują się statycznie (bez `client:*`).

## Migration Notes

Nie dotyczy — brak zmian danych.

## References

- Research: `context/changes/event-plan-ui/research.md`
- Issue: https://github.com/pstawik/carpooling/issues/45
- Wzorzec widoku: `src/pages/groups/[id].astro:18-21`, `:111-145`
- Wzorzec kitchen sinka: `src/pages/dev/ui-group.astro`
- Poprzednia zmiana UI: `context/archive/2026-11-16-group-page-ui/plan.md`, `tokens.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Komponent Badge

#### Automated

- [x] 1.1 Plik `src/components/ui/badge.tsx` istnieje i importuje `cn` z `@/lib/utils` — 871fa2f
- [x] 1.2 `git diff --stat package.json package-lock.json` jest pusty — 871fa2f
- [x] 1.3 `npm run lint` przechodzi — 871fa2f
- [x] 1.4 `npx astro check` przechodzi bez błędów — 871fa2f

### Phase 2: Rola `--success`

#### Automated

- [x] 2.1 `npm run lint` przechodzi — edeb748
- [x] 2.2 `npx astro check` przechodzi bez błędów — edeb748
- [x] 2.3 `npm run build` przechodzi — edeb748
- [x] 2.4 `global.css` zawiera `--color-success: var(--success)` w `@theme inline` i `--success` w `:root` oraz `.dark` — edeb748

#### Manual

- [x] 2.5 Kontrast `text-success` na `bg-card` nad `bg-cosmic` jest czytelny (sprawdzenie w DevTools lub na zrzucie z fazy 4) — 8ec3855

### Phase 3: Widok na tokenach i komponentach

#### Automated

- [x] 3.1 Hardcoded-value scan z `/10x-ui` na `[eventId].astro` zwraca 0 trafień (było 31) — f763fb6
- [x] 3.2 `npm run lint` przechodzi — f763fb6
- [x] 3.3 `npx astro check` przechodzi bez błędów — f763fb6
- [x] 3.4 `npm run build` przechodzi — f763fb6

#### Manual

- [x] 3.5 Na 360 px i desktopie: kolejność Bilans → Twoje dzieci → Plan dzieci → Twój przejazd → Kierowcy, bez przewijania w poziomie, kontrolki ≥ 44 px — f763fb6
- [x] 3.6 Zaznaczenie „Jedzie”/„Nie jedzie” wraca do `#twoje-dzieci`, zapis kierowcy i „Wycofaj” do `#twoj-przejazd`; komunikat błędu widoczny po skoku bez przewijania — f763fb6
- [x] 3.7 Liczba miejsc 0 lub 9 (przez DevTools) pokazuje „Podaj liczbę miejsc od 1 do 8” przy polu, pole ma `aria-invalid` — f763fb6
- [x] 3.8 Niedobór, „Miejsc wystarcza” i „Żadne dziecko jeszcze nie jedzie” wyglądają poprawnie i różnią się ikoną, nie tylko kolorem — f763fb6
- [x] 3.9 Konto bez dzieci w grupie widzi wskazówkę z działającym linkiem do `/groups/[id]#dzieci` — f763fb6
- [x] 3.10 Termin rozpoczęty: brak kontrolek, widoczny tekst „tylko do odczytu” — f763fb6

### Phase 4: Stany, kitchen sink i strażnik

#### Automated

- [x] 4.1 `npm run lint` przechodzi (w tym `check-ui-literals: 0 hits in 9 files`) — 8ec3855
- [x] 4.2 `npx astro check` przechodzi bez błędów — 8ec3855
- [x] 4.3 `npm run build` przechodzi — 8ec3855
- [x] 4.4 `npm run smoke` przechodzi na uruchomionym serwerze — 8ec3855

#### Manual

- [x] 4.5 `/dev/ui-event` pokazuje wszystkie 7 stanów (lub N/A z powodem); zrzuty na desktopie i 360 px — 8ec3855
- [x] 4.6 focus-visible: każdy przycisk, pole i link ma obwódkę w kolorze `--ring`; kliknięcie myszą nie pokazuje obwódki na linkach — 8ec3855
- [x] 4.7 Kontrast `--success` i plakietki „bez deklaracji” czytelny na zrzutach — 8ec3855
