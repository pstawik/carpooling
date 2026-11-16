# Group page UI — plan implementacji

## Overview

Podpinamy widok `/groups/[id]` pod kontrakt design-systemu: wartości z obecnego stylu „cosmic” trafiają do tokenów shadcn w aktywnym ciemnym motywie, a ręcznie kopiowane pola, karty i komunikaty zastępują komponenty z `src/components/ui/`. Przy okazji przestawiamy sekcje tak, żeby rodzic na 360 px od razu widział terminy, i zostawiamy regułę oraz skan w lincie, które utrzymają kontrakt w kolejnych zmianach. Zarzuty wejściowe: C1–C5 w `context/changes/group-page-ui/research.md` (`## Charges`).

## Current State Analysis

- Tokeny shadcn istnieją i są poprawnie publikowane (`src/styles/global.css:6` `:root`, `:41` `.dark`, `:75-111` `@theme inline`), ale żaden z 4 plików widoku nie używa ani jednej klasy tokenowej; skan literałów: `[id].astro` 40 linii, `EventItem.tsx` 5, `InvitePanel.tsx` 4, `ChildItem.tsx` 3 (research, Summary).
- `.dark` nigdy nie jest aktywne (brak klasy w `src/layouts/Layout.astro`), `body` dostaje jasne `bg-background` (`global.css:122`), brak `color-scheme` w `src/`. Każde z 14 użyć `<Button>` w widoku nadpisuje kolory przez `className` (C2).
- Pole formularza skopiowane 8× w 4 plikach widoku (C3), komunikat info/błąd 6× w `[id].astro` (C4); `src/components/ui/` ma tylko `button.tsx` i `LibBadge.astro`.
- Kolejność sekcji: Administratorzy → Terminy (lista + statystyki + 2 formularze admina) → Dzieci → Link → Powrót (`[id].astro:122-432`) (C5).
- Brak Playwrighta i frameworka testowego (`package.json`); jest husky `pre-commit` → `lint-staged` (`package.json:58-63`) i CI uruchamiające `npm run lint`.

## Desired End State

- `<html>` ma klasę `dark`, ciemne wartości `.dark` odwzorowują obecny styl „cosmic”, natywne kontrolki (date/time/select) renderują się w ciemnym schemacie, `body` jest ciemne.
- 4 pliki widoku zawierają wyłącznie klasy tokenowe i komponenty z `src/components/ui/` (`Button`, `Input`, `Card`, `Alert`); `node scripts/check-ui-literals.mjs` zwraca 0 trafień i jest częścią `npm run lint`.
- Na stronie grupy kolejność: Terminy (z komunikatami na górze karty i zwijanym „Zarządzaj terminami” dla admina) → Dzieci → Administratorzy → Link zaproszeniowy → Powrót.
- Strona `/dev/ui-group` (tylko w trybie dev) pokazuje komponenty widoku we wszystkich 7 stanach; zrzuty desktop + 360 px leżą w `context/changes/group-page-ui/screenshots/`.
- `AGENTS.md` ma blok UI wskazujący tokeny, komponenty, ścieżkę `shadcn add`, zakaz literałów i kitchen sink.

Weryfikacja: `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke`, przegląd zrzutów i ręczne przejście strony grupy jako admin i jako zwykły członek.

### Key Discoveries:

- `cn()` w `src/components/ui/button.tsx:47` scala `className` z wariantem przez tailwind-merge, więc literały w `className` wygrywają z wariantem — aktywacja `.dark` i nowe wartości nie zmienią wyglądu innych widoków, które nadpisują Button (wszystkie 8 miejsc z `<Button>` w `src/`, m.in. `src/components/auth/SubmitButton.tsx:16`).
- Komunikaty po akcjach są kierowane na kotwice `#terminy` / `#dzieci` przez `feedbackSection` (`src/pages/groups/[id].astro:36-52`); `id` tych kart musi zostać na kartach, w których komunikat jest renderowany.
- Komponenty React shadcn użyte w `.astro` bez `client:*` renderują się jako statyczny HTML — formularze SSR `method="POST"` działają bez zmian.
- `npx shadcn@latest add input card alert` nie dodaje zależności npm (styl `new-york`, `components.json`); `label` dodałby `@radix-ui/react-label` — odrzucone.
- Wzorzec odczytu trybu: brak użyć `import.meta.env.DEV` w `src/` — kitchen sink będzie pierwszym; Astro udostępnia go w SSR bez konfiguracji.

## What We're NOT Doing

- Adres powrotu po logowaniu (`src/middleware.ts:53`, `src/pages/api/auth/signin.ts:45`) — odroczony z C5, osobna zmiana (dotyka auth i walidacji przekierowań).
- Trasa `/groups` bez id (dziś 404) — odroczona z C5.
- Stan „wysyłanie”/blokada podwójnego wysłania formularzy — loading oznaczony N/A (SSR, pełne przeładowanie); ryzyko podwójnego „Dodaj dziecko” zostaje świadomie.
- Nowa paleta kolorów, przełącznik jasny/ciemny motyw, zmiany w innych widokach (dashboard, auth, plan terminu, statystyki, admin) — tylko globalne tokeny + ten widok.
- shadcn `label` i inne nowe zależności npm; Playwright/testy screenshotowe.
- Zmiany w API, bazie, RLS i logice uprawnień.

## Implementation Approach

Kolejność `/10x-ui`: środowisko/biblioteka → wartości tokenów → jeden widok → stany → strażnik. Najpierw dodajemy brakujące komponenty (bez użycia), potem aktywujemy ciemne tokeny z wartościami przeniesionymi 1:1 z literałów, dzięki czemu przepięcie widoku w fazie 3 jest prawie neutralne wizualnie (jedyna świadoma zmiana: nagłówek z gradientu na `text-foreground`). Stany i kitchen sink domykają macierz, a skan w lincie i reguła w `AGENTS.md` utrwalają kontrakt.

## Critical Implementation Details

- **Kolejność faz 2 → 3:** wariant `default` Buttona (`bg-primary`) wygląda poprawnie dopiero po fazie 2; usunięcie nadpisań `className` w fazie 3 przed aktywacją `.dark` dałoby jasne przyciski. Nie zamieniać kolejności.
- **Kotwice komunikatów:** po przestawieniu sekcji komunikaty `eventMessage`/`eventError` renderować bezpośrednio pod nagłówkiem karty `#terminy`, a `childMessage`/`childError` pod nagłówkiem `#dzieci` — po skoku do kotwicy na 360 px komunikat musi być widoczny bez przewijania.

## Faza 1: Komponenty shadcn

### Overview

Dodajemy do repo trzy brakujące komponenty kontraktu ścieżką stacku (C3, C4, karta z C1). Bez użycia w widoku — tylko biblioteka.

### Changes Required:

#### 1. Komponenty UI

**File**: `src/components/ui/input.tsx`, `src/components/ui/card.tsx`, `src/components/ui/alert.tsx`

**Intent**: Dodać `Input`, `Card` (z podkomponentami) i `Alert` przez `npx shadcn@latest add input card alert`, żeby widok miał jedno źródło pola, karty i komunikatu.

**Contract**: Pliki generowane przez CLI shadcn zgodnie z `components.json` (styl `new-york`, alias `@/components/ui`). Bez ręcznych zmian kolorów w plikach — wyłącznie tokeny, które CLI wpisuje. `package.json` i lockfile bez nowych zależności.

### Success Criteria:

#### Automated Verification:

- Pliki `src/components/ui/input.tsx`, `card.tsx`, `alert.tsx` istnieją
- `git diff --stat package.json package-lock.json` jest pusty
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej — commit, potem kolejna faza (brak kroków manualnych).

---

## Faza 2: Tokeny i ciemny motyw

### Overview

Aktywujemy ciemny motyw na warstwie tokenów i wpisujemy do `.dark` wartości obecnego stylu „cosmic” (C1, C2).

### Changes Required:

#### 1. Aktywacja motywu

**File**: `src/layouts/Layout.astro`

**Intent**: Ustawić `class="dark"` na `<html>`, żeby aktywne były wartości `.dark` w całej aplikacji.

**Contract**: `<html lang="pl" class="dark">`; bez przełącznika i bez skryptu.

#### 2. Wartości tokenów

**File**: `src/styles/global.css`

**Intent**: W bloku `.dark` zastąpić neutralne wartości shadcn rolami zmapowanymi z literałów widoku i dodać `color-scheme: dark`, z komentarzem wskazującym źródło (`context/changes/group-page-ui/tokens.md`).

**Contract**: Zmieniane zmienne w `.dark` (źródło literału w nawiasie):
- `--background` ← `#0a0e1a` (`bg-cosmic`, `global.css:113`), `--foreground` ← biel (`text-white`)
- `--card` / `--popover` ← `oklch(1 0 0 / 10%)` (`bg-white/10`, `[id].astro:91`), `--card-foreground` / `--popover-foreground` ← biel
- `--primary` ← purple-600 `oklch(0.558 0.288 302.321)` (`[id].astro:93`), `--primary-foreground` ← biel
- `--secondary` / `--accent` ← `oklch(1 0 0 / 10%)`, `--secondary-foreground` / `--accent-foreground` ← biel (przyciski drugorzędne `bg-white/10`)
- `--muted-foreground` ← blue-100 / 70% `oklch(0.932 0.032 255.585 / 70%)` (`text-blue-100/70`)
- `--border` ← `oklch(1 0 0 / 10%)` (`border-white/10`), `--input` ← `oklch(1 0 0 / 20%)` (`border-white/20`)
- `--ring` ← purple-400 `oklch(0.714 0.203 305.504)` (`focus:ring-purple-400`)
- `--destructive` ← zostaje `oklch(0.704 0.191 22.216)` (red-400; czytelne na ciemnym tle)
- `color-scheme: dark` w bloku `.dark`
`:root` (jasne) i `@theme inline` bez zmian. `bg-cosmic` zostaje utility w `global.css`.

#### 3. Depozyt wartości

**File**: `context/changes/group-page-ui/tokens.md` (nowy)

**Intent**: Zapisać tabelę token → wartość → literał źródłowy → plik:linia, żeby kolejna sesja nie wymyślała wartości od nowa.

**Contract**: Jedna tabela Markdown z wierszem na każdą zmienioną zmienną z sekcji 2.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `grep -c 'class="dark"' src/layouts/Layout.astro` zwraca 1
- `grep -c 'color-scheme: dark' src/styles/global.css` zwraca 1

#### Manual Verification:

- Strona startowa, dashboard, logowanie i plan terminu wyglądają jak przed zmianą (przyciski z nadpisaniami bez zmian, brak białych prześwitów)
- Pola date/time w formularzu „Dodaj termin” mają ciemny schemat i widoczną ikonę kalendarza/zegara

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 3.

---

## Faza 3: Widok na tokenach i komponentach

### Overview

Przepinamy 4 pliki widoku na tokeny i komponenty `ui/` oraz przestawiamy sekcje (C1, C3, C4, część C5).

### Changes Required:

#### 1. Strona grupy

**File**: `src/pages/groups/[id].astro`

**Intent**: Zastąpić `cardClass`, `inputClass`, `submitClass` i bloki komunikatów komponentami `Card`, `Input`, `Button`, `Alert`; literały kolorów — klasami tokenowymi (`text-foreground`, `text-muted-foreground`, `border-input` itd.); przestawić sekcje.

**Contract**:
- Kolejność: `Terminy` (`id="terminy"`) → `Dzieci` (`id="dzieci"`) → `Administratorzy` → `Link zaproszeniowy` (admin) → link „Wróć do panelu”.
- Karta `#terminy`: nagłówek → `Alert` z `eventMessage`/`eventError` → lista nadchodzących → minione (`details`) → link „Statystyki grupy” → dla admina jeden zwijany `details` „Zarządzaj terminami” zawierający formularz „Dodaj termin” i generator; `details` otwarty, gdy `eventError` jest niepusty (zastępuje `generatorOpen`).
- Karta `#dzieci`: nagłówek → `Alert` z `childMessage`/`childError` → listy → formularz.
- Komunikaty globalne (`message`/`error`) i błędy ładowania (`:140`, `:337`) przez `Alert` (`default` z ikoną `Info`, `destructive` z ikoną `CircleAlert`), z zachowaniem `role="status"` / `role="alert"`.
- Nagłówek `h1`: `text-foreground` zamiast gradientu `from-blue-200 to-purple-200` (świadoma zmiana wizualna).
- Linki-przyciski („Statystyki grupy”, „Wróć do panelu”) przez `buttonVariants({ variant: "outline" })` + `min-h-11`.
- `<option class="text-black">` usunięte (pokryte `color-scheme`).
- Zachowane: `min-h-11` na kontrolkach, nazwy pól formularzy, `action`, hidden inputs, ochrona 404.

#### 2. Komponenty grupy

**File**: `src/components/groups/ChildItem.tsx`, `src/components/groups/EventItem.tsx`, `src/components/groups/InvitePanel.tsx`

**Intent**: Usunąć lokalne `buttonClass`/`primaryClass`/`secondaryClass`/`inputClass`/`labelClass`; akcje główne jako `Button` (wariant `default`), drugorzędne jako `Button variant="outline"`, pola jako `Input`; textarea w `InvitePanel` z klasami tokenowymi.

**Contract**: Props i zachowanie (edycja inline, `confirm` przy usuwaniu, kopiowanie linku) bez zmian. Każdy `Button` zachowuje `min-h-11` (dotyk ≥ 44 px) przez `className` z samym rozmiarem, bez kolorów.

### Success Criteria:

#### Automated Verification:

- Skan literałów z `/10x-ui` na 4 plikach widoku zwraca 0 trafień
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `npm run smoke` przechodzi na uruchomionym serwerze

#### Manual Verification:

- Na 360 px karta „Terminy” jest pierwszą kartą pod nagłówkiem, bez poziomego przewijania
- Jako admin: dodanie terminu, wygenerowanie serii z błędem (`invalid_event_series`) i dodanie dziecka pokazują komunikat na górze właściwej karty po skoku do kotwicy; „Zarządzaj terminami” otwiera się przy błędzie
- Jako zwykły członek: brak „Zarządzaj terminami” i „Link zaproszeniowy”; link terminu otwiera plan
- Edycja/usuwanie dziecka i terminu oraz kopiowanie/regeneracja linku działają jak wcześniej

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 4. Zrzut desktop + 360 px po fazie.

---

## Faza 4: Stany i kitchen sink

### Overview

Domykamy macierz 7 stanów i budujemy bramkę wizualną bez nowych narzędzi.

### Changes Required:

#### 1. Kitchen sink

**File**: `src/pages/dev/ui-group.astro` (nowy)

**Intent**: Strona pokazująca jednocześnie elementy widoku w 7 stanach: `Button` (default/outline, hover opisany, `disabled`), `Input` (default, `disabled`, `aria-invalid`), `Alert` (info, destructive), `Card` z pustym stanem („Brak nadchodzących terminów.”), `ChildItem`/`EventItem`/`InvitePanel` z danymi przykładowymi, link planu i `<summary>`; komórka loading jako opis „N/A — SSR, brak doczytywania danych”.

**Contract**: Trasa `/dev/ui-group`; gdy `!import.meta.env.DEV` → `Astro.rewrite("/404")`. Bez zapytań do Supabase, dane wpisane w stronie. Używa `Layout` i tych samych komponentów co widok.

#### 2. Focus-visible

**File**: `src/pages/groups/[id].astro`, `src/components/groups/EventItem.tsx`

**Intent**: Linki planu terminu i `<summary>` dostają widoczny fokus z tokenu `--ring` (dziś tylko globalne `outline-ring/50` + styl przeglądarki).

**Contract**: `focus-visible:outline-2 focus-visible:outline-ring` (lub odpowiednik ring) na linkach z `planLinkClass` i na `summary`; bez stylu na `:focus` dla myszy.

#### 3. Zrzuty

**File**: `context/changes/group-page-ui/screenshots/` (nowy katalog)

**Intent**: Zachować dowód bramki: kitchen sink oraz strona grupy (admin) na desktopie i 360 px.

**Contract**: Pliki PNG: `kitchen-sink-desktop.png`, `kitchen-sink-360.png`, `group-admin-desktop.png`, `group-admin-360.png`.

### Success Criteria:

#### Automated Verification:

- Skan literałów na 4 plikach widoku i `src/pages/dev/ui-group.astro` zwraca 0 trafień
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi, a `/dev/ui-group` w buildzie produkcyjnym zwraca 404

#### Manual Verification:

- Kitchen sink pokazuje każdą z 7 komórek macierzy (lub N/A z powodem) na desktopie i 360 px
- Nawigacja Tab po stronie grupy pokazuje fokus w kolorze `--ring` na każdym linku, `summary`, polu i przycisku
- Zrzuty zapisane w `context/changes/group-page-ui/screenshots/`

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 5.

---

## Faza 5: Strażnik kontraktu

### Overview

Utrwalamy kontrakt: skan literałów w lincie (CI) i reguła dla agentów; odroczone zarzuty zapisane.

### Changes Required:

#### 1. Skan literałów

**File**: `scripts/check-ui-literals.mjs` (nowy), `package.json`

**Intent**: Skrypt Node bez zależności, który uruchamia regex skanu `/10x-ui` na liście plików oczyszczonych w tej zmianie i kończy się kodem 1 z listą `plik:linia` przy trafieniu; podpięty pod `npm run lint`, więc działa też w CI.

**Contract**: Lista plików w skrypcie: `src/pages/groups/[id].astro`, `src/components/groups/ChildItem.tsx`, `src/components/groups/EventItem.tsx`, `src/components/groups/InvitePanel.tsx`, `src/pages/dev/ui-group.astro`. Skrypt `lint` w `package.json`: `eslint . && node scripts/check-ui-literals.mjs`. Regex identyczny ze skanem z `/10x-ui` (hex, `rgb(a)`, `hsl(a)`, `oklch(`, arbitralne `-[Npx|rem]`, klasy palety Tailwind z prefiksami `bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide`).

#### 2. Reguła dla agentów

**File**: `AGENTS.md`

**Intent**: Dodać do sekcji „Coding Style” krótki blok UI: tokeny w `src/styles/global.css` (wartości w `.dark`, aplikacja zawsze w trybie `dark`), komponenty w `src/components/ui/` — sprawdź przed tworzeniem nowego, brakujące przez `npx shadcn@latest add <name>`; brak literałów kolorów i arbitralnych wartości w widokach; kitchen sink `/dev/ui-group`; skan `scripts/check-ui-literals.mjs` — nowy oczyszczony widok dopisz do jego listy.

**Contract**: Blok poza markerami `<!-- BEGIN @przeprogramowani/10x-cli -->` … `<!-- END … -->` (jeśli istnieją); bez drugiego pliku reguł.

#### 3. Odroczone zarzuty

**File**: `context/changes/group-page-ui/research.md`

**Intent**: Oznaczyć w `## Charges` odroczone elementy C5 (adres powrotu po logowaniu, trasa `/groups`) oraz komórkę loading jako **deferred** z powodem.

**Contract**: Dopisek pod C5 i w tabeli 7 stanów; aktualizacja `last_updated` / `last_updated_by` / `last_updated_note` we frontmatter.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi i uruchamia `check-ui-literals`
- Dodanie testowo `text-purple-200` do `[id].astro` powoduje błąd `npm run lint` (sprawdzić i cofnąć)
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi

#### Manual Verification:

- Blok UI w `AGENTS.md` jest zrozumiały i wskazuje poprawne ścieżki
- CI na PR przechodzi (`ci` i `smoke`)

**Implementation Note**: Po fazie — `/10x-impl-review group-page-ui`; uwagi UI nie są domyślnie „kosmetyczne”.

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych w repo (AGENTS.md, „Testing”) — nie dodajemy.

### Integration Tests:

- `npm run smoke` (przepływ auth) na uruchomionym serwerze po fazach 3–5.

### Manual Testing Steps:

1. Zaloguj się jako admin grupy, otwórz `/groups/<id>` na desktopie i w DevTools przy 360 px; sprawdź kolejność sekcji i brak poziomego przewijania.
2. Dodaj termin, wygeneruj serię z zakresem > 1 rok (błąd), dodaj dziecko — komunikat na górze właściwej karty.
3. Zaloguj się jako zwykły członek — brak sekcji admina; link terminu otwiera plan.
4. Przejdź stronę klawiszem Tab — fokus widoczny na każdym elemencie interaktywnym.
5. Otwórz `/dev/ui-group` — wszystkie komórki macierzy 7 stanów widoczne.
6. Otwórz dashboard, logowanie i plan terminu — wygląd bez regresji.

## Performance Considerations

Brak istotnych: zmiany są stylistyczne i statyczne; nie dochodzi JS po stronie klienta (komponenty `Input`/`Card`/`Alert` renderowane w SSR).

## Migration Notes

Nie dotyczy (brak zmian danych). Wycofanie: revert commitów fazy; faza 2 jest globalna, ale inne widoki nadpisują Button literałami, więc jej revert przywraca stan sprzed zmiany.

## References

- Research: `context/changes/group-page-ui/research.md`
- Skill: `.claude/skills/10x-ui/SKILL.md` (skan, macierz 7 stanów, „Make it stick”)
- Wzorzec komponentu z wariantami: `src/components/ui/button.tsx:7-33`
- Kotwice komunikatów: `src/pages/groups/[id].astro:36-52`, `src/lib/services/group-errors`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Komponenty shadcn

#### Automated

- [x] 1.1 Pliki `src/components/ui/input.tsx`, `card.tsx`, `alert.tsx` istnieją — ded1c27
- [x] 1.2 `git diff --stat package.json package-lock.json` jest pusty — ded1c27
- [x] 1.3 `npm run lint` przechodzi — ded1c27
- [x] 1.4 `npx astro check` przechodzi bez błędów — ded1c27

### Phase 2: Tokeny i ciemny motyw

#### Automated

- [x] 2.1 `npm run lint` przechodzi — 12394be
- [x] 2.2 `npx astro check` przechodzi bez błędów — 12394be
- [x] 2.3 `npm run build` przechodzi — 12394be
- [x] 2.4 `grep -c 'class="dark"' src/layouts/Layout.astro` zwraca 1 — 12394be
- [x] 2.5 `grep -c 'color-scheme: dark' src/styles/global.css` zwraca 1 — 12394be

#### Manual

- [x] 2.6 Strona startowa, dashboard, logowanie i plan terminu wyglądają jak przed zmianą (przyciski z nadpisaniami bez zmian, brak białych prześwitów) — 12394be
- [x] 2.7 Pola date/time w formularzu „Dodaj termin” mają ciemny schemat i widoczną ikonę kalendarza/zegara — 12394be

### Phase 3: Widok na tokenach i komponentach

#### Automated

- [x] 3.1 Skan literałów z `/10x-ui` na 4 plikach widoku zwraca 0 trafień — 76f2f15
- [x] 3.2 `npm run lint` przechodzi — 76f2f15
- [x] 3.3 `npx astro check` przechodzi bez błędów — 76f2f15
- [x] 3.4 `npm run build` przechodzi — 76f2f15
- [x] 3.5 `npm run smoke` przechodzi na uruchomionym serwerze — 76f2f15

#### Manual

- [x] 3.6 Na 360 px karta „Terminy” jest pierwszą kartą pod nagłówkiem, bez poziomego przewijania — 76f2f15
- [x] 3.7 Jako admin: dodanie terminu, wygenerowanie serii z błędem (`invalid_event_series`) i dodanie dziecka pokazują komunikat na górze właściwej karty po skoku do kotwicy; „Zarządzaj terminami” otwiera się przy błędzie — 76f2f15
- [x] 3.8 Jako zwykły członek: brak „Zarządzaj terminami” i „Link zaproszeniowy”; link terminu otwiera plan — 76f2f15
- [x] 3.9 Edycja/usuwanie dziecka i terminu oraz kopiowanie/regeneracja linku działają jak wcześniej — 76f2f15

### Phase 4: Stany i kitchen sink

#### Automated

- [x] 4.1 Skan literałów na 4 plikach widoku i `src/pages/dev/ui-group.astro` zwraca 0 trafień — c27d5cd
- [x] 4.2 `npm run lint` przechodzi — c27d5cd
- [x] 4.3 `npx astro check` przechodzi bez błędów — c27d5cd
- [x] 4.4 `npm run build` przechodzi, a `/dev/ui-group` w buildzie produkcyjnym zwraca 404 — c27d5cd

#### Manual

- [x] 4.5 Kitchen sink pokazuje każdą z 7 komórek macierzy (lub N/A z powodem) na desktopie i 360 px — c27d5cd
- [x] 4.6 Nawigacja Tab po stronie grupy pokazuje fokus w kolorze `--ring` na każdym linku, `summary`, polu i przycisku — c27d5cd
- [x] 4.7 Zrzuty zapisane w `context/changes/group-page-ui/screenshots/` — c27d5cd

### Phase 5: Strażnik kontraktu

#### Automated

- [x] 5.1 `npm run lint` przechodzi i uruchamia `check-ui-literals` — 0e1ea18
- [x] 5.2 Dodanie testowo `text-purple-200` do `[id].astro` powoduje błąd `npm run lint` (sprawdzić i cofnąć) — 0e1ea18
- [x] 5.3 `npx astro check` przechodzi bez błędów — 0e1ea18
- [x] 5.4 `npm run build` przechodzi — 0e1ea18

#### Manual

- [x] 5.5 Blok UI w `AGENTS.md` jest zrozumiały i wskazuje poprawne ścieżki — 0e1ea18
- [x] 5.6 CI na PR przechodzi (`ci` i `smoke`) — 0e1ea18
