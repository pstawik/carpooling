# Logowanie i rejestracja na kontrakcie design-systemu, z kolorem autouzupełniania z palety — plan implementacji

## Overview

Przenosimy ekran logowania (`/auth/signin`) i rejestracji (`/auth/signup`) wraz z komponentami `src/components/auth/` na istniejący kontrakt design-systemu (tokeny `.dark`, `ui/input`, `ui/alert`, `ui/button`, `ui/card`, stałe z `group-page-classes.ts`). Musztardowe tło autouzupełnianych pól zastępujemy nową rolą `--autofill` — przyciemnionym, nieprzezroczystym odcieniem `--primary`. Zalogowany użytkownik na `/auth/*` trafia od razu do aplikacji. Na koniec kitchen sink `/dev/ui-auth` i strażnik lintu. Issue: https://github.com/pstawik/carpooling/issues/54.

## Current State Analysis

- 15 linii z literałami w ścieżce logowania (`signin.astro:15`, `:16`, `:21`, `:29`, `:36`, `:40`; `FormField.tsx:6`, `:41`, `:45`, `:61`, `:67`; `PasswordToggle.tsx:13`; `ServerError.tsx:11`; `SubmitButton.tsx:16`, `:20`), plus `SignUpForm.tsx:21` i 5 linii w `signup.astro` (`:14-31`) — `research.md` § Charges C2–C4.
- W `src/` nie ma reguły `:autofill`; pole jest półprzezroczyste (`FormField.tsx:6`), więc tło autouzupełniania przeglądarki przebija — C1.
- Jedyny import z `ui/` to `Button` w `SubmitButton.tsx:2`, nadpisany literałami (`:16`); `ui/input` istnieje, ale auth go nie używa — C3.
- Zalogowany na `/auth/signin` widzi formularz (`signin.astro:1-11` nie czyta `Astro.locals.user`); komponenty auth są wspólne z rejestracją (`SignUpForm.tsx:3-6`); brak kitchen sinka i wpisów w `CLEANED_VIEWS`; smoke nie czyta HTML `/auth/*` — C5.

## Desired End State

- Autouzupełnione pole ma tło `--autofill` (`oklch(0.36 0.12 302.321)` ≈ `#4a2870`) i biały tekst, także przy fokusie, w każdym polu aplikacji opartym o `<input>`.
- `/auth/signin` i `/auth/signup`: wyśrodkowana `Card` z `cardClass`, nagłówek `text-foreground` bez gradientu, komunikaty w `Alert` (`success` dla „Konto utworzone — zaloguj się”, `default` + `Info` dla zaproszenia, `destructive` dla błędu serwera), pola na `ui/input` z fokusem `--ring` i błędem `--destructive`, link w `--link` z widoczną obwódką fokusu.
- Zalogowany użytkownik na `/auth/signin` lub `/auth/signup` → 302 na `/join/<invite>` (gdy jest poprawny `?invite=`) albo na `/dashboard`.
- `/dev/ui-auth` pokazuje 7 stanów + stan autouzupełniony; skan literałów na 9 plikach auth i sinku: 0; wszystkie w `CLEANED_VIEWS`.
- Weryfikacja: `npm run lint`, `npx astro check`, `npm run build`, `npm run smoke` (z nowymi krokami), zrzuty na desktopie i 360 px, autouzupełnianie sprawdzone w Edge i Chrome.

### Key Discoveries:

- W Tailwind 4.3.3 `box-shadow` utility jest składany: `var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)` (zbudowany CSS `dist/client/_astro/*.css`) — `--tw-inset-shadow` w stanie `:autofill` współistnieje z `focus-visible:ring-*` i `shadow-xs` z `ui/input`.
- Precedens nowej roli: `--success` / `--success-foreground` w `:root` i `.dark` z notką źródła (`global.css:23-25`, `:63-65`) i `tokens.md` w folderze zmiany (`event-plan-ui`).
- `group-page-classes.ts` ma już `inputClass`, `labelClass`, `focusRingClass`, `cardClass`, `submitClass`, `hintLinkClass` — wystarczą dla auth.
- `/join/[token].astro:67` obsługuje zalogowanego (formularz dołączenia) — przekierowanie z `?invite=` tam nie gubi zaproszenia.
- Wyliczenia kontrastu `--autofill`: `research.md` § Autouzupełnianie (biały 11,46:1, `--ring` 4,11:1).

## What We're NOT Doing

- Adres powrotu po logowaniu (`middleware.ts:53`, `api/auth/signin.ts:45`) — nadal odroczony, jak w `group-page-ui`.
- `index.astro`, `404.astro`, `join/[token].astro` — ten sam szablon literałów, osobne zmiany.
- `src/components/ui/LibBadge.astro`.
- Logika API auth, walidacja zod, teksty błędów (`auth-errors.ts`).
- Zmiana układu na `Topbar` — wyśrodkowana karta zostaje (decyzja).
- Usunięcie `FormField` — zostaje jako wrapper nad `ui/input` (decyzja).

## Implementation Approach

Kolejność `/10x-ui`: środowisko (N/A) → wartości tokenów → widok → stany → strażnik. Faza 1 wprowadza samą rolę i regułę — naprawia musztardę od razu, jeszcze na starych polach. Faza 2 przepina współdzielone komponenty (wpływa na oba formularze naraz), faza 3 — strony i wejście dla zalogowanego, faza 4 — bramka wizualna, faza 5 — strażnik.

## Critical Implementation Details

- **Reguła autouzupełniania musi działać z utility i bez nich.** W `@layer base` reguła dla `input:autofill`, `input:-webkit-autofill` i `input[data-autofill-preview]` ustawia jednocześnie `--tw-inset-shadow: inset 0 0 0 1000px var(--autofill)` (dla pól z `shadow-*`/`ring-*`, np. `ui/input` — utility nadpisuje `box-shadow` z warstwy base, ale składa tę zmienną) oraz `box-shadow: inset 0 0 0 1000px var(--autofill)` (dla pól bez takich utility, np. dzisiejszy `FormField` w spoczynku). Do tego `-webkit-text-fill-color` i `caret-color` z `--autofill-foreground`. Wartość musi być nieprzezroczysta.
- **Podgląd w sinku:** `:autofill` nie da się wymusić CSS-em, dlatego selektor `[data-autofill-preview]` jest częścią tej samej reguły — sink renderuje pole z tym atrybutem i pokazuje dokładnie te same deklaracje.
- **`cn()` i promienie:** przy łączeniu `focusRingClass` (`rounded-sm`) z klasami o innym promieniu `focusRingClass` stoi pierwszy (lekcja z `dashboard-ui`).

## Faza 1: Token `--autofill` i reguła `:autofill`

### Overview

Nowa rola tokenu i reguła w warstwie bazowej; musztardowe tło znika na istniejących polach (C1).

### Changes Required:

#### 1. Wartości tokenów

**File**: `context/changes/auth-signin-ui/tokens.md` (nowy)

**Intent**: Zdeponować wartości `--autofill` / `--autofill-foreground` (`:root` i `.dark`), ich pochodzenie (odcień `--primary`, decyzja użytkownika) i tabelę kontrastu z `research.md`.

**Contract**: `.dark`: `--autofill: oklch(0.36 0.12 302.321)`, `--autofill-foreground: oklch(1 0 0)` (= `--primary-foreground`); `:root` (motyw jasny, nieużywany, dla kompletności jak `--success`): `--autofill: oklch(0.94 0.04 302.321)`, `--autofill-foreground: oklch(0.145 0 0)`.

#### 2. Tokeny i reguła bazowa

**File**: `src/styles/global.css`

**Intent**: Dodać role w `:root` i `.dark` z komentarzem źródła (`context/changes/auth-signin-ui/tokens.md`), opublikować `--color-autofill` / `--color-autofill-foreground` w `@theme inline` i dodać regułę autouzupełniania w `@layer base`.

**Contract**: Selektor `input:autofill, input:-webkit-autofill, input[data-autofill-preview]`; deklaracje jak w Critical Implementation Details. Istniejące tokeny bez zmian.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi, a zbudowany CSS zawiera regułę z `--autofill` dla `:autofill`

#### Manual Verification:

- W Edge i Chrome na `/auth/signin`: po wybraniu zapamiętanego loginu pola są fioletowe (`#4a2870`), nie musztardowe; po kliknięciu w pole kolor zostaje, a obwódka fokusu jest widoczna
- Autouzupełnione pole na stronie grupy (np. formularz z `Input`) też ma fioletowe tło

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 2.

---

## Faza 2: Komponenty auth na kontrakcie

### Overview

Współdzielone komponenty formularzy logowania i rejestracji przechodzą na `ui/` i tokeny (C2, C3, C4).

### Changes Required:

#### 1. Pole formularza

**File**: `src/components/auth/FormField.tsx`

**Intent**: Zachować API (`id`, `label`, `value`, `onChange`, `icon`, `endContent`, `error`, `hint`, …), ale w środku renderować `Input` z `ui/` zamiast własnego `<input>`; usunąć `inputBase` i literały.

**Contract**:
- Pole: `Input` z `cn(inputClass, "pl-10", endContent && "pr-11")`; stany z `ui/input` (`focus-visible:ring-ring/50`, `aria-invalid:border-destructive`).
- Etykieta: `labelClass` + odstęp; ikona `text-muted-foreground`.
- Błąd: `text-destructive text-xs` z ikoną; akapit błędu ma `id`, a pole `aria-describedby` na niego, gdy błąd jest.
- Nowy opcjonalny prop `autofillPreview?: boolean` → atrybut `data-autofill-preview` na polu (tylko dla kitchen sinka).

#### 2. Błąd serwera

**File**: `src/components/auth/ServerError.tsx`

**Intent**: Zastąpić ręczny `<p>` przez `Alert variant="destructive"` + `CircleAlert` + `AlertDescription`; brak komunikatu → `null` jak dziś.

**Contract**: API bez zmian (`message?: string | null`).

#### 3. Przycisk wysyłki

**File**: `src/components/auth/SubmitButton.tsx`

**Intent**: Usunąć nadpisania koloru — wariant `default` `Button` daje `bg-primary` (ta sama wartość co `purple-600`); spinner na tokenach.

**Contract**: `className={submitClass}` (z `group-page-classes.ts`); spinner `border-primary-foreground/30 border-t-primary-foreground`; API bez zmian.

#### 4. Przełącznik hasła

**File**: `src/components/auth/PasswordToggle.tsx`

**Intent**: Tokeny koloru i widoczny fokus klawiatury.

**Contract**: `text-muted-foreground hover:text-foreground` + `focusRingClass` (przed klasami promienia); rozmiar 44 px i `aria-label` bez zmian.

#### 5. Podpowiedź w rejestracji

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Podpowiedź pod polem (`:21`) w `text-muted-foreground`.

**Contract**: Tylko klasa koloru; logika formularza bez zmian.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan z `/10x-ui` na `FormField.tsx`, `ServerError.tsx`, `SubmitButton.tsx`, `PasswordToggle.tsx`, `SignUpForm.tsx`, `SignInForm.tsx` zwraca 0 trafień
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `npm run smoke` przechodzi na uruchomionym serwerze

#### Manual Verification:

- Na 360 px i desktopie, `/auth/signin` i `/auth/signup`: pola, przycisk i błąd serwera wyglądają jak w reszcie aplikacji; brak przewijania w poziomie; kontrolki ≥ 44 px
- Tab po polach i „Pokaż hasło” pokazuje obwódkę `--ring`; błąd walidacji pola (np. pusty e-mail) ma czerwoną obwódkę i tekst w `--destructive`; podczas wysyłki przycisk jest nieaktywny ze spinnerem

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 3.

---

## Faza 3: Strony logowania i rejestracji

### Overview

Karta, nagłówek, komunikaty i link na kontrakcie; zalogowany użytkownik omija formularze (C2, C3, C5).

### Changes Required:

#### 1. Logowanie

**File**: `src/pages/auth/signin.astro`

**Intent**: Usunąć literały karty, gradientu, komunikatów i linku; dodać przekierowanie zalogowanego.

**Contract**:
- Układ: `bg-cosmic flex min-h-screen items-center justify-center p-4` → `Card` z `cn(cardClass, "mb-0 w-full max-w-sm")` (bez przesunięcia wyśrodkowanej karty przez `mb-6`).
- `h1` „Logowanie”: `text-foreground mb-6 text-center text-2xl font-bold`.
- `?message=account_created`: `Alert variant="success" role="status"` + `CircleCheck` (wzór `[eventId].astro:134-135`); zaproszenie: `Alert role="status"` + `Info`.
- Stopka: tekst `text-muted-foreground`, link „Zarejestruj się” z `hintLinkClass`; `href` z `invite` bez zmian.
- Przekierowanie: gdy `Astro.locals.user` → `Astro.redirect(invite ? "/join/<invite>" : "/dashboard")`, po wyliczeniu `invite` (tylko poprawny token, `optionalInviteToken`).

#### 2. Rejestracja

**File**: `src/pages/auth/signup.astro`

**Intent**: To samo dla rejestracji: karta, nagłówek „Rejestracja”, komunikat zaproszenia, link „Zaloguj się”, przekierowanie zalogowanego.

**Contract**: Jak w logowaniu (bez komunikatu `account_created`, którego strona nie ma).

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Zabezpieczyć nowe wejście: wylogowany dostaje formularze, zalogowany — przekierowanie.

**Contract**: Kroki: wylogowany `GET /auth/signin` i `/auth/signup` → 200; zalogowany (po „signup creates account and signs in”) `GET /auth/signin` → 302 `/dashboard`. Istniejące kroki bez zmian.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan na `signin.astro` i `signup.astro` zwraca 0 trafień
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `npm run smoke` przechodzi na uruchomionym serwerze, z nowymi krokami dla `/auth/signin` i `/auth/signup`

#### Manual Verification:

- Na 360 px i desktopie: obie karty wyglądają jak karty w aplikacji (bez gradientu), komunikat „Konto utworzone — zaloguj się” jest zielonym `Alert`, komunikat zaproszenia — `Alert` z ikoną info
- Tab na „Zarejestruj się” / „Zaloguj się” pokazuje obwódkę `--ring`; zalogowany wchodzący na `/auth/signin` ląduje na panelu, a z `?invite=<token>` — na stronie dołączenia do grupy

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymać się na potwierdzenie weryfikacji manualnej przed fazą 4.

---

## Faza 4: Kitchen sink `/dev/ui-auth`

### Overview

Bramka wizualna: wszystkie stany pól i komunikatów auth na jednej stronie dev-only.

### Changes Required:

#### 1. Kitchen sink

**File**: `src/pages/dev/ui-auth.astro` (nowy)

**Intent**: Strona dev-only wzorowana na `ui-stats.astro` / `ui-dashboard.astro`, renderująca `FormField`, `PasswordToggle`, `ServerError`, `SubmitButton` i `Alert`-y komunikatów statycznie (bez wyspy, `onChange` jako no-op), przez te same komponenty i stałe co strony.

**Contract**:
- Guard `if (!import.meta.env.DEV) return Astro.rewrite("/404")`; brak zapytań do Supabase.
- Karty stanów: **default** (pola e-mail i hasło z ikoną i przełącznikiem, wypełnione i z placeholderem), **hover** (przycisk, przełącznik, link), **focus-visible** (Tab po polach, przełączniku, przycisku, linku), **disabled** (przycisk w trakcie wysyłki), **error** (błąd pola + `ServerError`), **empty** (puste pola z placeholderem — formularz nie ma danych do wczytania), **loading** (przycisk „Logowanie...” ze spinnerem), dodatkowo **autouzupełniony** (`autofillPreview`) i **komunikaty** (`success` „Konto utworzone”, zaproszenie).
- Klasy wyłącznie z komponentów, `group-page-classes.ts` i tokenów; lokalne stałe tylko dla etykiet stanów sinka.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan na `src/pages/dev/ui-auth.astro` zwraca 0 trafień
- `npm run lint` przechodzi
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi, a `/dev/ui-auth` w buildzie produkcyjnym odpowiada 404

#### Manual Verification:

- `/dev/ui-auth` pokazuje 7 stanów + autouzupełniony + komunikaty; zrzuty na desktopie i 360 px
- Pole w stanie autouzupełnionym w sinku wygląda tak samo jak prawdziwe autouzupełnione pole na `/auth/signin`

**Implementation Note**: Po zielonej weryfikacji automatycznej i potwierdzeniu zrzutów — commit, potem faza 5.

---

## Faza 5: Strażnik

### Overview

Utrwalamy kontrakt w lincie i w regułach dla agentów (C5).

### Changes Required:

#### 1. Strażnik lintu

**File**: `scripts/check-ui-literals.mjs`

**Intent**: Dopisać do `CLEANED_VIEWS` strony auth, komponenty auth i sink.

**Contract**: 9 nowych wpisów (`src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, 6 plików `src/components/auth/*.tsx`, `src/pages/dev/ui-auth.astro`): 13 → 22; logika skryptu bez zmian.

#### 2. Reguła dla agentów

**File**: `AGENTS.md`

**Intent**: W `### UI` dopisać `/dev/ui-auth` do listy kitchen sinków i jedno zdanie: tło autouzupełniania to rola `--autofill` w warstwie bazowej `global.css` — nie stylować `:autofill` w komponentach.

**Contract**: Edycja istniejącego punktu o kitchen sinkach + jeden nowy punkt w `### UI`; bez nowej sekcji.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi (w tym `check-ui-literals: 0 hits in 22 files`)
- `npx astro check` przechodzi bez błędów
- `npm run build` przechodzi
- `npm run smoke` przechodzi na uruchomionym serwerze

**Implementation Note**: Po zielonej weryfikacji automatycznej — commit, potem `/10x-impl-review auth-signin-ui`.

---

## Testing Strategy

### Unit Tests:

- N/A — repo nie ma frameworka testów jednostkowych (AGENTS.md § Testing).

### Integration Tests:

- `npm run smoke`: istniejące kroki auth (`smoke.mjs:46-50`, `:220-246`) + nowe: `GET /auth/signin`, `/auth/signup` dla wylogowanego (200) i `GET /auth/signin` dla zalogowanego (302 `/dashboard`).

### Manual Testing Steps:

1. Edge i Chrome: zapisz login, wróć na `/auth/signin`, wybierz go z podpowiedzi — pola fioletowe, także przy fokusie.
2. `/auth/signin` i `/auth/signup` na 360 px: Tab po wszystkich kontrolkach, błąd walidacji pustego pola, błąd serwera (`?error=invalid_credentials`), komunikat `?message=account_created`, `?invite=<token>`.
3. Zalogowany: `/auth/signin` → panel; `/auth/signin?invite=<token>` → strona dołączenia.
4. `/dev/ui-auth` na desktopie i 360 px: wszystkie stany, zrzuty.

## Performance Considerations

Bez zmian — jedna reguła CSS i to samo SSR; przekierowanie zalogowanego oszczędza render formularza.

## Migration Notes

N/A — brak zmian danych.

## References

- Research: `context/changes/auth-signin-ui/research.md`
- Issue: https://github.com/pstawik/carpooling/issues/54
- Precedens nowej roli: `context/archive/2026-11-17-event-plan-ui/` (`--success`, `tokens.md`)
- Wzorzec sinka: `src/pages/dev/ui-dashboard.astro`, `src/pages/dev/ui-stats.astro`
- Alert sukcesu: `src/pages/groups/[id]/terminy/[eventId].astro:134-135`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Token `--autofill` i reguła `:autofill`

#### Automated

- [x] 1.1 `npm run lint` przechodzi — 343e557
- [x] 1.2 `npx astro check` przechodzi bez błędów — 343e557
- [x] 1.3 `npm run build` przechodzi, a zbudowany CSS zawiera regułę z `--autofill` dla `:autofill` — 343e557

#### Manual

- [x] 1.4 W Edge i Chrome na `/auth/signin`: po wybraniu zapamiętanego loginu pola są fioletowe (`#4a2870`), nie musztardowe; po kliknięciu w pole kolor zostaje, a obwódka fokusu jest widoczna — 343e557
- [x] 1.5 Autouzupełnione pole na stronie grupy (np. formularz z `Input`) też ma fioletowe tło — 343e557

### Phase 2: Komponenty auth na kontrakcie

#### Automated

- [x] 2.1 Hardcoded-value scan z `/10x-ui` na `FormField.tsx`, `ServerError.tsx`, `SubmitButton.tsx`, `PasswordToggle.tsx`, `SignUpForm.tsx`, `SignInForm.tsx` zwraca 0 trafień — 3b021cc
- [x] 2.2 `npm run lint` przechodzi — 3b021cc
- [x] 2.3 `npx astro check` przechodzi bez błędów — 3b021cc
- [x] 2.4 `npm run build` przechodzi — 3b021cc
- [x] 2.5 `npm run smoke` przechodzi na uruchomionym serwerze — 3b021cc

#### Manual

- [x] 2.6 Na 360 px i desktopie, `/auth/signin` i `/auth/signup`: pola, przycisk i błąd serwera wyglądają jak w reszcie aplikacji; brak przewijania w poziomie; kontrolki ≥ 44 px — 3b021cc
- [x] 2.7 Tab po polach i „Pokaż hasło” pokazuje obwódkę `--ring`; błąd walidacji pola (np. pusty e-mail) ma czerwoną obwódkę i tekst w `--destructive`; podczas wysyłki przycisk jest nieaktywny ze spinnerem — 3b021cc

### Phase 3: Strony logowania i rejestracji

#### Automated

- [x] 3.1 Hardcoded-value scan na `signin.astro` i `signup.astro` zwraca 0 trafień — b8ff1f0
- [x] 3.2 `npm run lint` przechodzi — b8ff1f0
- [x] 3.3 `npx astro check` przechodzi bez błędów — b8ff1f0
- [x] 3.4 `npm run build` przechodzi — b8ff1f0
- [x] 3.5 `npm run smoke` przechodzi na uruchomionym serwerze, z nowymi krokami dla `/auth/signin` i `/auth/signup` — b8ff1f0

#### Manual

- [x] 3.6 Na 360 px i desktopie: obie karty wyglądają jak karty w aplikacji (bez gradientu), komunikat „Konto utworzone — zaloguj się” jest zielonym `Alert`, komunikat zaproszenia — `Alert` z ikoną info — b8ff1f0
- [x] 3.7 Tab na „Zarejestruj się” / „Zaloguj się” pokazuje obwódkę `--ring`; zalogowany wchodzący na `/auth/signin` ląduje na panelu, a z `?invite=<token>` — na stronie dołączenia do grupy — b8ff1f0

### Phase 4: Kitchen sink `/dev/ui-auth`

#### Automated

- [x] 4.1 Hardcoded-value scan na `src/pages/dev/ui-auth.astro` zwraca 0 trafień — 2d0302a
- [x] 4.2 `npm run lint` przechodzi — 2d0302a
- [x] 4.3 `npx astro check` przechodzi bez błędów — 2d0302a
- [x] 4.4 `npm run build` przechodzi, a `/dev/ui-auth` w buildzie produkcyjnym odpowiada 404 — 2d0302a

#### Manual

- [x] 4.5 `/dev/ui-auth` pokazuje 7 stanów + autouzupełniony + komunikaty; zrzuty na desktopie i 360 px — 2d0302a
- [x] 4.6 Pole w stanie autouzupełnionym w sinku wygląda tak samo jak prawdziwe autouzupełnione pole na `/auth/signin` — 2d0302a

### Phase 5: Strażnik

#### Automated

- [x] 5.1 `npm run lint` przechodzi (w tym `check-ui-literals: 0 hits in 22 files`)
- [x] 5.2 `npx astro check` przechodzi bez błędów
- [x] 5.3 `npm run build` przechodzi
- [x] 5.4 `npm run smoke` przechodzi na uruchomionym serwerze
