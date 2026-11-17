# Panel (`/dashboard`) na kontrakcie design-systemu — plan implementacji

## Overview

Przenosimy `src/pages/dashboard.astro` — pierwszy ekran po zalogowaniu — na istniejący kontrakt design-systemu (tokeny `.dark`, komponenty z `src/components/ui/`, `Topbar`, stałe z `group-page-classes.ts`), zmieniamy układ na taki jak w widokach grupy, dajemy pustemu stanowi następny krok, budujemy kitchen sink `/dev/ui-dashboard` i dopisujemy widok do strażnika lintu. Issue: https://github.com/pstawik/carpooling/issues/52.

## Current State Analysis

- Widok czyta z warstwy tokenów tylko `bg-cosmic` (`dashboard.astro:23`); importy z `ui/`, `group-page-classes.ts` i `Topbar`: 0 (`:1-4`). Skan literałów: 11 linii (`:24`, `:25`, `:28`, `:31`, `:34`, `:42`, `:45`, `:53`, `:56`, `:67`, `:74`) — `research.md` § Charges C1–C3.
- Układ to wyśrodkowana karta `max-w-sm` w stylu stron auth/404 (`:23-24`), bez `Topbar`; nick (`:27-35`) i „Wyloguj” (`:72-77`) powtarzają `Topbar.astro:10-21` — C4.
- Pusty stan „Nie należysz jeszcze do żadnej grupy.” (`:45`) nie mówi o jedynej ścieżce dołączenia — link zaproszeniowy (PRD FR-006) — C4.
- Brak kitchen sinka i wpisu w `CLEANED_VIEWS` (`scripts/check-ui-literals.mjs:10-22`) — C5.
- Wejścia (wylogowany → 302, brak profilu → e-mail, app-admin → link) są poprawne i zostają bez zmian (`middleware.ts:5-10`, `smoke.mjs:46`).

## Desired End State

- `/dashboard` wygląda jak widoki grupy: `bg-cosmic` → `mx-auto max-w-xl` → `Topbar` → `h1` „Cześć, {imię}!” → karta-region „Twoje grupy” → przycisk „Panel administratora” (tylko app-admin).
- Nick i wylogowanie są wyłącznie w `Topbar`; link „Panel” w `Topbar` ma `aria-current="page"` na `/dashboard`.
- Lista grup: wiersze z tokenów, pigułka `Badge`, widoczna obwódka fokusu w kolorze `--ring`; błąd w `Alert destructive`; pusty stan „Nie należysz jeszcze do żadnej grupy. Poproś administratora grupy o link zaproszeniowy.”
- Skan literałów na widoku i sinku: 0 trafień; oba pliki w `CLEANED_VIEWS`; `/dev/ui-dashboard` pokazuje 7 stanów (lub N/A z powodem).
- Weryfikacja: `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke`, zrzuty sinka na desktopie i 360 px.

### Key Discoveries:

- Każdy literał ma rolę w `.dark` — brak nowych tokenów (`global.css:46-83`; mapowanie w `research.md` § Widok → źródło).
- `smoke.mjs:205-214` szuka ostatniego `/groups/<uuid>` **przed** nazwą grupy w HTML — `href` musi poprzedzać nazwę i nic z `/groups/` nie może stać między nimi.
- `smoke.mjs:228-230` wymaga nicku w HTML panelu — spełnia go `Topbar` (`Topbar.astro:10`).
- Wzorce: układ `[id].astro:104-120`, kitchen sink `src/pages/dev/ui-stats.astro`.

## What We're NOT Doing

- Strony auth, `404.astro`, `index.astro`, `join/[token].astro` — ten sam szablon literałów, osobne zmiany.
- `src/components/ui/LibBadge.astro` (literały palety, nieużywany w panelu).
- Rename `group-page-classes.ts` na plik wspólny — decyzja: import z istniejącego pliku.
- Nowe tokeny, nowe komponenty shadcn, zmiany w `listMyGroups` lub middleware.
- Nowe funkcje panelu (np. podgląd najbliższych terminów).

## Implementation Approach

Kolejność `/10x-ui`: środowisko i wartości tokenów (N/A — kontrakt kompletny) → jeden widok → stany → strażnik. Faza 1 przepina markup na kontrakt bez zmiany układu; faza 2 zmienia układ i nawigację w osobnym commicie, żeby zmianę zachowania łatwo było ocenić; faza 3 buduje bramkę wizualną; faza 4 utrwala kontrakt.

## Critical Implementation Details

- **Wspólne stałe:** ciąg klas wiersza grupy używany i w widoku, i w `/dev/ui-dashboard` trafia do `group-page-classes.ts` jako nowa stała (np. `groupLinkClass`); sink nie kopiuje stałych (lekcja F5 z `group-page-ui`). Przy składaniu przez `cn()` `focusRingClass` musi stać **przed** `listItemClass` — oba ustawiają promień (`rounded-sm` vs `rounded-xl`), a `tailwind-merge` zostawia ostatni.
- **Kolejność w markupie:** wiersz grupy zostaje jednym `<a href="/groups/<id>">` z nazwą w środku, przed pigułką (`smoke.mjs:205-214`).

## Faza 1: Widok na tokenach i komponentach

### Overview

Podmieniamy literały i ręcznie zbudowane kontrolki na tokeny i komponenty kontraktu (C1, C2, C3); układ (wyśrodkowana karta) zostaje.

### Changes Required:

#### 1. Panel

**File**: `src/pages/dashboard.astro`

**Intent**: Usunąć wszystkie literały palety i ręczne kopie komponentów; zastąpić je `Card`, `Badge`, `Alert`, `buttonVariants`, stałymi i klasami ról.

**Contract**:
- Karta: `Card` z `cardClass` (+ obecne ograniczenia szerokości i `text-center`), `rounded-xl` z komponentu.
- Nagłówek: `text-foreground`, bez gradientu i `text-transparent`; tekst wyciszony `text-muted-foreground`; wyróżnienia `text-foreground`.
- Błąd ładowania: `Alert variant="destructive" role="alert"` + `CircleAlert` + `AlertDescription` z dotychczasowym tekstem.
- Wiersz grupy: nowa stała z `group-page-classes.ts` (`listItemClass` + `focusRingClass` + `flex min-h-11 … hover:bg-accent`); pigułka „administrator”: `Badge` (wariant `default`).
- „Panel administratora”: `buttonVariants()` z `h-auto min-h-11`; „Wyloguj”: `linkButtonClass`.
- Bez zmian: ładowanie danych (`:5-19`), teksty, `href`-y, kolejność `href` → nazwa.

#### 2. Wspólne stałe

**File**: `src/components/groups/group-page-classes.ts`

**Intent**: Dodać stałą wiersza grupy i wymienić panel oraz jego przyszły sink w komentarzu modułu.

**Contract**: Jeden nowy eksport; komentarz nagłówka rozszerzony o `src/pages/dashboard.astro` i `src/pages/dev/ui-dashboard.astro`; istniejące eksporty bez zmian.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan z `/10x-ui` na `dashboard.astro` zwraca 0 trafień (było 11 linii)
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi

#### Manual Verification:

- Na 360 px i desktopie: karta i wiersze grup wyglądają jak na stronie grupy, brak przewijania w poziomie, kontrolki ≥ 44 px
- Tab na wierszu grupy, „Panel administratora” i „Wyloguj” pokazuje obwódkę w kolorze `--ring`

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 2.

---

## Faza 2: Układ i nawigacja

### Overview

Panel dostaje układ widoków grupy i `Topbar`, traci duplikaty nawigacji, a pusty stan — następny krok (C4).

### Changes Required:

#### 1. Układ panelu

**File**: `src/pages/dashboard.astro`

**Intent**: Zastąpić wyśrodkowaną kartę układem ze strony grupy i usunąć powtórzone w treści elementy `Topbar`.

**Contract**:
- Struktura: `bg-cosmic min-h-screen p-4` → `mx-auto w-full max-w-xl` → `<Topbar />` → `h1` (`text-foreground mb-4 text-2xl font-bold break-words`, „Cześć, {first_name}!” / „Cześć!” bez profilu) → `Card` „Twoje grupy” z `role="region"` i `aria-labelledby` → „Panel administratora” (warunek `isAppAdmin` bez zmian) pod kartą. Wyrównanie do lewej.
- Usunięte: akapit z nickiem/e-mailem (`:27-35`) i formularz „Wyloguj” (`:72-77`).
- Pusty stan: „Nie należysz jeszcze do żadnej grupy. Poproś administratora grupy o link zaproszeniowy.” w `text-muted-foreground`.
- `<Layout title="Panel">` bez zmian.

#### 2. `Topbar`

**File**: `src/components/Topbar.astro`

**Intent**: Oznaczyć link „Panel” jako bieżącą stronę, gdy użytkownik jest na `/dashboard`.

**Contract**: `aria-current="page"` na linku „Panel”, gdy `Astro.url.pathname === "/dashboard"`; brak atrybutu na pozostałych stronach; wygląd bez zmian.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan na `dashboard.astro` i `Topbar.astro` zwraca 0 trafień
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `npm run smoke` przechodzi na uruchomionym serwerze (nick w HTML, lista grup, link do grupy)

#### Manual Verification:

- Na 360 px i desktopie: `Topbar` u góry, nagłówek i karta „Twoje grupy” wyrównane jak na stronie grupy, jeden przycisk „Wyloguj” (w `Topbar`)
- Konto bez grup widzi tekst o linku zaproszeniowym; czytnik ekranu / inspektor pokazuje `aria-current="page"` na „Panel” tylko na `/dashboard`

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 3.

---

## Faza 3: Kitchen sink `/dev/ui-dashboard`

### Overview

Bramka wizualna: wszystkie stany panelu na jednej stronie dev-only.

### Changes Required:

#### 1. Kitchen sink

**File**: `src/pages/dev/ui-dashboard.astro` (nowy)

**Intent**: Strona dev-only wzorowana na `ui-stats.astro`, z danymi wpisanymi w stronę, pokazująca elementy panelu w 7 stanach przez te same komponenty i stałe co widok.

**Contract**:
- Guard `if (!import.meta.env.DEV) return Astro.rewrite("/404")`; brak zapytań do Supabase; bez `Topbar` (zależy od `Astro.locals`, już w `CLEANED_VIEWS`).
- Karty stanów: **default** (lista 3 grup: członek, administrator z `Badge`, długa nazwa łamana `break-words`; nagłówek z imieniem i wariant „Cześć!” bez profilu), **hover** (wiersz grupy, „Panel administratora”), **focus-visible** (Tab na wierszu grupy i przycisku, obwódka `--ring`), **disabled** (N/A — brak kontrolek ze stanem nieaktywnym), **error** (`Alert destructive` z tekstem widoku), **empty** (pusty stan z tekstem o linku zaproszeniowym), **loading** (N/A — SSR, `listMyGroups` przed wysłaniem HTML).
- Klasy wyłącznie z `group-page-classes.ts` i tokenów; lokalne stałe tylko dla etykiet stanów sinka (jak `ui-stats.astro`).

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan na `src/pages/dev/ui-dashboard.astro` zwraca 0 trafień
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi, a `/dev/ui-dashboard` w buildzie produkcyjnym odpowiada 404

#### Manual Verification:

- `/dev/ui-dashboard` pokazuje wszystkie 7 stanów (lub N/A z powodem); zrzuty na desktopie i 360 px
- Kontrast `text-muted-foreground` (70 % zamiast dawnych 80 %) czytelny na zrzutach

**Implementation Note**: Po zielonej weryfikacji automatycznej i potwierdzeniu zrzutów — commit, potem faza 4.

---

## Faza 4: Strażnik

### Overview

Utrwalamy kontrakt w lincie i w regułach dla agentów (C5).

### Changes Required:

#### 1. Strażnik lintu

**File**: `scripts/check-ui-literals.mjs`

**Intent**: Dopisać `src/pages/dashboard.astro` i `src/pages/dev/ui-dashboard.astro` do `CLEANED_VIEWS`.

**Contract**: Dwa nowe wpisy w tablicy `CLEANED_VIEWS` (11 → 13); logika skryptu bez zmian.

#### 2. Reguła dla agentów

**File**: `AGENTS.md`

**Intent**: W sekcji `### UI` dopisać `/dev/ui-dashboard` do listy kitchen sinków.

**Contract**: Edycja istniejącego punktu „Kitchen sinks with the 7 component states” w `### UI`; bez nowej sekcji.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi (w tym `check-ui-literals: 0 hits in 13 files`)
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `npm run smoke` przechodzi na uruchomionym serwerze

**Implementation Note**: Po zielonej weryfikacji automatycznej — commit, potem `/10x-impl-review dashboard-ui`.

---

## Testing Strategy

### Unit Tests:

- N/A — repo nie ma frameworka testów jednostkowych (AGENTS.md § Testing).

### Integration Tests:

- `npm run smoke`: przekierowanie wylogowanego (`smoke.mjs:46`), nick w HTML (`:228-230`), lista grup i wyciągnięcie linku (`:205-214`, `:277`), brak grupy u obcego (`:297-299`).

### Manual Testing Steps:

1. Zaloguj się kontem z grupami (członek i admin grupy): `Topbar`, nagłówek, wiersze z pigułką, Tab po wierszach.
2. Zaloguj się nowym kontem bez grup: pusty stan z tekstem o linku zaproszeniowym.
3. Konto app-admina: przycisk „Panel administratora” pod kartą, prowadzi do `/admin/groups`.
4. `/dev/ui-dashboard` na desktopie i 360 px: 7 stanów, zrzuty.

## Performance Considerations

Bez zmian — te same zapytania (`listMyGroups`, flaga app-admina w middleware); `Topbar` nie robi zapytań.

## Migration Notes

N/A — brak zmian danych.

## References

- Research: `context/changes/dashboard-ui/research.md`
- Issue: https://github.com/pstawik/carpooling/issues/52
- Wzorzec planu: `context/archive/2026-11-17-group-stats-ui/plan.md`
- Wzorzec układu: `src/pages/groups/[id].astro:104-120`
- Wzorzec sinka: `src/pages/dev/ui-stats.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Widok na tokenach i komponentach

#### Automated

- [x] 1.1 Hardcoded-value scan z `/10x-ui` na `dashboard.astro` zwraca 0 trafień (było 11 linii) — d8919d1
- [x] 1.2 `npm run lint` przechodzi — d8919d1
- [x] 1.3 `npx astro check` przechodzi bez błędów — d8919d1
- [x] 1.4 `npm run build` przechodzi — d8919d1

#### Manual

- [x] 1.5 Na 360 px i desktopie: karta i wiersze grup wyglądają jak na stronie grupy, brak przewijania w poziomie, kontrolki ≥ 44 px — d8919d1
- [x] 1.6 Tab na wierszu grupy, „Panel administratora” i „Wyloguj” pokazuje obwódkę w kolorze `--ring` — d8919d1

### Phase 2: Układ i nawigacja

#### Automated

- [x] 2.1 Hardcoded-value scan na `dashboard.astro` i `Topbar.astro` zwraca 0 trafień — fe78666
- [x] 2.2 `npm run lint` przechodzi — fe78666
- [x] 2.3 `npx astro check` przechodzi bez błędów — fe78666
- [x] 2.4 `npm run build` przechodzi — fe78666
- [x] 2.5 `npm run smoke` przechodzi na uruchomionym serwerze (nick w HTML, lista grup, link do grupy) — fe78666

#### Manual

- [x] 2.6 Na 360 px i desktopie: `Topbar` u góry, nagłówek i karta „Twoje grupy” wyrównane jak na stronie grupy, jeden przycisk „Wyloguj” (w `Topbar`) — fe78666
- [x] 2.7 Konto bez grup widzi tekst o linku zaproszeniowym; czytnik ekranu / inspektor pokazuje `aria-current="page"` na „Panel” tylko na `/dashboard` — fe78666

### Phase 3: Kitchen sink `/dev/ui-dashboard`

#### Automated

- [x] 3.1 Hardcoded-value scan na `src/pages/dev/ui-dashboard.astro` zwraca 0 trafień — a29b6a8
- [x] 3.2 `npm run lint` przechodzi — a29b6a8
- [x] 3.3 `npx astro check` przechodzi bez błędów — a29b6a8
- [x] 3.4 `npm run build` przechodzi, a `/dev/ui-dashboard` w buildzie produkcyjnym odpowiada 404 — a29b6a8

#### Manual

- [x] 3.5 `/dev/ui-dashboard` pokazuje wszystkie 7 stanów (lub N/A z powodem); zrzuty na desktopie i 360 px — a29b6a8
- [x] 3.6 Kontrast `text-muted-foreground` (70 % zamiast dawnych 80 %) czytelny na zrzutach — a29b6a8

### Phase 4: Strażnik

#### Automated

- [x] 4.1 `npm run lint` przechodzi (w tym `check-ui-literals: 0 hits in 13 files`) — d9676fe
- [x] 4.2 `npx astro check` przechodzi bez błędów — d9676fe
- [x] 4.3 `npm run build` przechodzi — d9676fe
- [x] 4.4 `npm run smoke` przechodzi na uruchomionym serwerze — d9676fe
