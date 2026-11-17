# Group stats UI — plan implementacji

## Overview

Przenosimy widok statystyk grupy `/groups/[id]/statystyki` na kontrakt design-systemu, z którego korzystają już widok grupy i plan terminu: tokeny z `src/styles/global.css`, komponenty z `src/components/ui/` i stałe z `src/components/groups/group-page-classes.ts`. Upraszczamy pusty stan do jednej karty, zmieniamy nagłówek na wzór planu terminu, budujemy kitchen sink `/dev/ui-stats` i dopisujemy widok do `CLEANED_VIEWS`. Issue: https://github.com/pstawik/carpooling/issues/49

## Current State Analysis

- Widok (`src/pages/groups/[id]/statystyki.astro`, 124 linie) ma 11 linii z literałami palety (18 klas) i 0 klas tokenowych; z warstwy tokenów czyta tylko `bg-cosmic` (`:45`); 0 importów z `ui/` i z `group-page-classes.ts` (`:1-7`) — research C1.
- Lokalne `cardClass` (`:40`) i `rowClass` (`:41`) powielają `Card` + `cardClass` i `listItemClass`; nagłówek z gradientem (`:50`); tekst wyciszony `text-blue-100/70` w 6 liniach — C1.
- Błąd ładowania to akapit `text-red-300` w zwykłej karcie (`:55-59`) — C2.
- „Wróć do grupy” to ręczny przycisk bez `focus-visible` (`:116-121`) — C3.
- Przy 0 zakończonych terminach dwie karty: podsumowanie z regułami (`:63-69`) + komunikat (`:71-76`); sekcje bez `role="region"` (`:79`, `:91`) — C4.
- Brak kitchen sinka; widoku nie ma w `CLEANED_VIEWS` (`scripts/check-ui-literals.mjs:10-20`) — C5.

## Desired End State

- Widok czyta wyłącznie tokeny i komponenty repo; `npm run lint` zwraca `check-ui-literals: 0 hits in 11 files` z widokiem i `/dev/ui-stats` na liście `CLEANED_VIEWS`.
- Nagłówek: nazwa grupy jako wyciszony wiersz, pod nią `h1` „Statystyki” w `text-foreground`.
- Błąd ładowania: `Alert variant="destructive"` z ikoną `CircleAlert`.
- Grupa bez zakończonych terminów: jedna karta z komunikatem „Brak zakończonych terminów — statystyki pojawią się po pierwszym terminie.”; licznik i reguły liczenia pokazują się tylko razem z danymi.
- Karty z danymi (podsumowanie, Kierowcy, Dzieci) to `Card` z `role="region"` i `aria-labelledby`; wiersze z `listItemClass`; „Wróć do grupy” z `linkButtonClass`.
- `/dev/ui-stats` pokazuje 7 stanów (disabled i loading jako N/A z powodem), zrzuty na desktopie i 360 px.

### Key Discoveries:

- Wartości `.dark` pokrywają literały 1:1 dla karty, obramowania, wiersza i tekstu wyciszonego (`global.css:50`, `:56`, `:59`, `:66`), więc przepięcie jest wizualnie neutralne poza nagłówkiem, błędem, linkiem powrotu i promieniem karty (`rounded-xl` z `card.tsx:8`) — research, tabela mapowania.
- Wzorzec widoku podrzędnego grupy: `src/pages/groups/[id]/terminy/[eventId].astro:100-104` (nagłówek), `:113-117` (błąd ładowania), `:120` (region).
- Wzorzec kitchen sinka: `src/pages/dev/ui-event.astro` (guard dev-only `:26-28`, karta na stan, stałe klas sinka tylko dla etykiet stanów `:44-45`).
- Smoke wymaga w HTML „Statystyki” i „Brak zakończonych terminów” (`scripts/smoke.mjs:621`) — oba teksty zostają.
- Lista kierowców ma ≥1 wiersz dla członka (`supabase/migrations/20261116130000_create_engagement_stats.sql:55-60`), więc nie dodajemy pustego stanu kierowców.

## What We're NOT Doing

- Zmiany w serwisie `stats.ts`, SQL, RLS, regułach liczenia i treściach etykiet (`drivesLabel`, teksty reguł).
- Nowe tokeny ani komponenty shadcn — kroki „środowisko/biblioteka” i „wartości tokenów” z `/10x-ui` są N/A, bo wszystkie role już istnieją (research, Summary).
- Pusty stan listy kierowców — nieosiągalny dla członka (Key Discoveries).
- Ranking, wykresy, sortowanie inne niż alfabetyczne (decyzja z `group-engagement-stats`).
- Inne widoki (dashboard, admin, auth) i zmiana nazwy `group-page-classes.ts`.
- Testy zrzutowe w Playwright (repo ich nie ma) — bramką jest kitchen sink + zrzuty.

## Implementation Approach

Kolejność `/10x-ui`: biblioteka i tokeny (N/A) → jeden widok → stany → strażnik. Faza 1 przepina markup na kontrakt bez zmiany struktury pustego stanu; faza 2 zmienia strukturę (jedna karta, regiony), żeby zmiana zachowania była osobnym, łatwym do oceny commitem; faza 3 buduje bramkę wizualną; faza 4 utrwala kontrakt.

## Critical Implementation Details

- **Wspólne stałe:** każdy ciąg klas używany i w widoku, i w `/dev/ui-stats` (poza pojedynczymi klasami tokenowymi typu `text-muted-foreground`) trafia do `group-page-classes.ts`, a komentarz modułu wymienia widok statystyk i jego sink — sink nie kopiuje stałych (lekcja F5 z `group-page-ui`).

## Faza 1: Widok na tokenach i komponentach

### Overview

Przepinamy `statystyki.astro` na `Card`, `Alert`, stałe z `group-page-classes.ts` i klasy tokenowe; zmieniamy nagłówek (C1, C2, C3).

### Changes Required:

#### 1. Strona statystyk

**File**: `src/pages/groups/[id]/statystyki.astro`

**Intent**: Usunąć lokalne `cardClass` i `rowClass` oraz wszystkie literały palety; zastąpić je komponentami i stałymi kontraktu; nagłówek w układzie planu terminu.

**Contract**:
- Nagłówek: `<p>` z nazwą grupy `text-muted-foreground mb-1 text-sm break-words`, `h1` „Statystyki” `text-foreground text-2xl font-bold`; `<Layout title>` bez zmian.
- Błąd ładowania: `Alert variant="destructive" role="alert"` + `CircleAlert` + `AlertDescription` „Nie udało się wczytać statystyk.” (bez otaczającej karty).
- Karty: `Card` z `className={cardClass}` (z `group-page-classes.ts`) w miejscu każdego lokalnego `cardClass`; `mb-6` pochodzi już z `cardClass`.
- Wiersze kierowców i dzieci: `listItemClass`; tekst wyciszony: `text-muted-foreground`.
- „Wróć do grupy”: `linkButtonClass`, `href` bez zmian.
- Zachowane bez zmian: strażnik 404 (`:12-21`), ładowanie danych (`:23-38`), id `kierowcy`/`dzieci`, teksty etykiet i reguł.

#### 2. Wspólne stałe — komentarz

**File**: `src/components/groups/group-page-classes.ts`

**Intent**: Komentarz modułu wymienia widok statystyk jako trzeciego konsumenta.

**Contract**: Tylko komentarz; eksporty bez zmian.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan z `/10x-ui` na `statystyki.astro` zwraca 0 trafień (było 11 linii)
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi

#### Manual Verification:

- Na 360 px i desktopie: nagłówek z nazwą grupy nad „Statystyki”, karty wyglądają jak na stronie grupy, brak przewijania w poziomie, „Wróć do grupy” ≥ 44 px
- Tab na „Wróć do grupy” pokazuje obwódkę w kolorze `--ring`

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 2.

---

## Faza 2: Pusty stan i regiony

### Overview

Jedna karta przy braku zakończonych terminów; karty z danymi jako regiony z etykietą (C4).

### Changes Required:

#### 1. Struktura stanów

**File**: `src/pages/groups/[id]/statystyki.astro`

**Intent**: Przy `finishedCount === 0` renderować tylko jedną kartę z komunikatem; karta podsumowania (licznik + reguły liczenia) i karty list renderują się wyłącznie przy `finishedCount > 0`.

**Contract**:
- `finishedCount === 0`: jeden `Card` z `cardClass` i akapitem `text-muted-foreground` „Brak zakończonych terminów — statystyki pojawią się po pierwszym terminie.”; bez licznika i reguł.
- `finishedCount > 0`: karta podsumowania jako region — nagłówek `h2` „Zakończone terminy: {n}” (id `podsumowanie-heading`) + reguły liczenia; karty `#kierowcy` i `#dzieci` z `role="region"` i `aria-labelledby` na id swoich `h2`.
- Pusta lista dzieci przy `finishedCount > 0`: komunikat „W grupie nie ma jeszcze dzieci.” bez zmian.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan na `statystyki.astro` dalej 0 trafień
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `npm run smoke` przechodzi na uruchomionym serwerze (w tym „stats page renders for member”)

#### Manual Verification:

- Grupa bez zakończonych terminów: dokładnie jedna karta z komunikatem, bez „Zakończone terminy: 0”
- Grupa z zakończonym terminem (wstawionym jako postgres lub przez zmianę `starts_at`): karta podsumowania z licznikiem i regułami, karty Kierowcy i Dzieci; czytnik ekranu / drzewo dostępności pokazuje trzy regiony z nazwami

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 3.

---

## Faza 3: Kitchen sink `/dev/ui-stats`

### Overview

Bramka wizualna: wszystkie stany widoku statystyk na jednej stronie dev-only.

### Changes Required:

#### 1. Kitchen sink

**File**: `src/pages/dev/ui-stats.astro` (nowy)

**Intent**: Strona dev-only wzorowana na `ui-event.astro`, z danymi wpisanymi w stronę, pokazująca elementy statystyk w 7 stanach przez te same komponenty, stałe i helper `drivesLabel` co widok.

**Contract**:
- Guard `if (!import.meta.env.DEV) return Astro.rewrite("/404")`; brak zapytań do Supabase.
- Karty stanów: **default** (podsumowanie z licznikiem i regułami, 2–3 kierowców z różnymi formami `drivesLabel`, dzieci z nickiem rodzica i bez), **hover** („Wróć do grupy”), **focus-visible** (Tab na „Wróć do grupy”, obwódka `--ring`), **disabled** (N/A — widok tylko do odczytu, jedyna kontrolka to link), **error** (błąd ładowania w `Alert destructive`), **empty** (brak zakończonych terminów — jedna karta; brak dzieci przy >0 terminach), **loading** (N/A — SSR, dane w `Promise.all` przed wysłaniem HTML).
- Klasy wyłącznie z `group-page-classes.ts` i tokenów; lokalne stałe tylko dla etykiet stanów sinka (jak `ui-event.astro:44-45`).

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan na `src/pages/dev/ui-stats.astro` zwraca 0 trafień
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi, a `/dev/ui-stats` w buildzie produkcyjnym odpowiada 404

#### Manual Verification:

- `/dev/ui-stats` pokazuje wszystkie 7 stanów (lub N/A z powodem); zrzuty na desktopie i 360 px
- Kontrast `text-muted-foreground` na kartach czytelny na zrzutach

**Implementation Note**: Po zielonej weryfikacji automatycznej i potwierdzeniu zrzutów — commit, potem faza 4.

---

## Faza 4: Strażnik

### Overview

Utrwalamy kontrakt w lincie i w regułach dla agentów (C5).

### Changes Required:

#### 1. Strażnik lintu

**File**: `scripts/check-ui-literals.mjs`

**Intent**: Dopisać `src/pages/groups/[id]/statystyki.astro` i `src/pages/dev/ui-stats.astro` do `CLEANED_VIEWS`.

**Contract**: Dwa nowe wpisy w tablicy `CLEANED_VIEWS` (9 → 11); logika skryptu bez zmian.

#### 2. Reguła dla agentów

**File**: `AGENTS.md`

**Intent**: W sekcji `### UI` dopisać `/dev/ui-stats` do listy kitchen sinków.

**Contract**: Edycja istniejącego punktu „Kitchen sinks with the 7 component states” w `### UI`; bez nowej sekcji.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi (w tym `check-ui-literals: 0 hits in 11 files`)
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `npm run smoke` przechodzi na uruchomionym serwerze

**Implementation Note**: Po zielonej weryfikacji automatycznej — commit, potem `/10x-impl-review group-stats-ui`.

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych w repo (AGENTS.md) — weryfikacja przez lint, `astro check`, build, smoke.

### Integration Tests:

- `npm run smoke` na uruchomionym serwerze w fazach 2 i 4: render strony dla członka z pustym stanem, link ze strony grupy, 404 dla obcego (`smoke.mjs:613-630`).

### Manual Testing Steps:

1. Otwórz statystyki grupy bez zakończonych terminów: jedna karta z komunikatem, nagłówek z nazwą grupy.
2. Ustaw jednemu terminowi `starts_at` w przeszłości (Supabase Studio): podsumowanie, Kierowcy, Dzieci z liczbami.
3. Przejdź Tabem do „Wróć do grupy”: widoczna obwódka `--ring`; Enter wraca do grupy.
4. Otwórz `/dev/ui-stats` na desktopie i 360 px.

## Performance Considerations

Brak — zmiana wyłącznie w markupie SSR; `Card` i `Alert` renderują się statycznie (bez `client:*`).

## Migration Notes

Nie dotyczy — brak zmian danych.

## References

- Research: `context/changes/group-stats-ui/research.md`
- Issue: https://github.com/pstawik/carpooling/issues/49
- Wzorzec widoku: `src/pages/groups/[id]/terminy/[eventId].astro:95-120`
- Wzorzec kitchen sinka: `src/pages/dev/ui-event.astro`
- Poprzednie zmiany UI: `context/archive/2026-11-17-event-plan-ui/plan.md`, `context/archive/2026-11-16-group-page-ui/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Widok na tokenach i komponentach

#### Automated

- [x] 1.1 Hardcoded-value scan z `/10x-ui` na `statystyki.astro` zwraca 0 trafień (było 11 linii)
- [x] 1.2 `npm run lint` przechodzi
- [x] 1.3 `npx astro check` przechodzi bez błędów
- [x] 1.4 `npm run build` przechodzi

#### Manual

- [x] 1.5 Na 360 px i desktopie: nagłówek z nazwą grupy nad „Statystyki”, karty wyglądają jak na stronie grupy, brak przewijania w poziomie, „Wróć do grupy” ≥ 44 px
- [x] 1.6 Tab na „Wróć do grupy” pokazuje obwódkę w kolorze `--ring`

### Phase 2: Pusty stan i regiony

#### Automated

- [ ] 2.1 Hardcoded-value scan na `statystyki.astro` dalej 0 trafień
- [ ] 2.2 `npm run lint` przechodzi
- [ ] 2.3 `npx astro check` przechodzi bez błędów
- [ ] 2.4 `npm run build` przechodzi
- [ ] 2.5 `npm run smoke` przechodzi na uruchomionym serwerze (w tym „stats page renders for member”)

#### Manual

- [ ] 2.6 Grupa bez zakończonych terminów: dokładnie jedna karta z komunikatem, bez „Zakończone terminy: 0”
- [ ] 2.7 Grupa z zakończonym terminem (wstawionym jako postgres lub przez zmianę `starts_at`): karta podsumowania z licznikiem i regułami, karty Kierowcy i Dzieci; czytnik ekranu / drzewo dostępności pokazuje trzy regiony z nazwami

### Phase 3: Kitchen sink `/dev/ui-stats`

#### Automated

- [ ] 3.1 Hardcoded-value scan na `src/pages/dev/ui-stats.astro` zwraca 0 trafień
- [ ] 3.2 `npm run lint` przechodzi
- [ ] 3.3 `npx astro check` przechodzi bez błędów
- [ ] 3.4 `npm run build` przechodzi, a `/dev/ui-stats` w buildzie produkcyjnym odpowiada 404

#### Manual

- [ ] 3.5 `/dev/ui-stats` pokazuje wszystkie 7 stanów (lub N/A z powodem); zrzuty na desktopie i 360 px
- [ ] 3.6 Kontrast `text-muted-foreground` na kartach czytelny na zrzutach

### Phase 4: Strażnik

#### Automated

- [ ] 4.1 `npm run lint` przechodzi (w tym `check-ui-literals: 0 hits in 11 files`)
- [ ] 4.2 `npx astro check` przechodzi bez błędów
- [ ] 4.3 `npm run build` przechodzi
- [ ] 4.4 `npm run smoke` przechodzi na uruchomionym serwerze
