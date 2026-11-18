---
date: 2026-11-17T12:01:03+01:00
researcher: Claude Code (claude-opus-5-5)
git_commit: 701c826
branch: dashboard-ui
repository: carpooling
topic: "Audyt UI widoku /auth/signin względem kontraktu design-systemu, z kolorem autouzupełniania z palety aplikacji"
tags: [research, ui, design-tokens, shadcn, auth, autofill, 10x-ui]
status: complete
last_updated: 2026-11-17
last_updated_by: Claude Code (claude-opus-5-5)
---

# Research: Audyt UI ekranu logowania (`/auth/signin`)

**Date**: 2026-11-17T12:01:03+01:00
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: 701c826
**Branch**: dashboard-ui
**Repository**: carpooling
**Issue**: https://github.com/pstawik/carpooling/issues/54

## Research Question

Dwukierunkowy audyt widoku `/auth/signin` (`src/pages/auth/signin.astro` + wyspa `SignInForm` i komponenty `FormField`, `PasswordToggle`, `ServerError`, `SubmitButton` z `src/components/auth/`), zgodnie z `/10x-ui`:

1. **Źródło → widok:** które tokeny z `src/styles/global.css` i komponenty z `src/components/ui/` widok czyta.
2. **Widok → źródło:** jaki token/komponent powinien pokryć każdy literał.
3. **Autouzupełnianie:** skąd bierze się musztardowe tło pól po autouzupełnieniu i jaka wartość z palety (decyzja użytkownika: przyciemniony `--primary`) je zastąpi — z kontrastem.
4. **Architektura:** wejścia (zalogowany na `/auth/signin`, `?error=`, `?message=`, `?invite=`), współdzielenie z `/auth/signup`, kitchen sink, guard.

Wynik: 3–5 zarzutów z `plik:linia` i skutkiem dla użytkownika (`## Charges`).

## Summary

- **Wariant kontraktu: istniejący design system.** Wartości `.dark` w `global.css:46-83`, publikacja `:85-124`; komponenty `input`, `alert`, `button`, `card` w `src/components/ui/`; stałe `inputClass`, `focusRingClass` w `group-page-classes.ts`. Ścieżka logowania importuje z `ui/` tylko `Button` (`SubmitButton.tsx:2`), a i jego wygląd nadpisuje literałami (`:16`).
- **Skan literałów (wzorzec `/10x-ui`):** 15 linii w ścieżce logowania — `signin.astro:15`, `:16`, `:21`, `:29`, `:36`, `:40`; `FormField.tsx:6`, `:41`, `:45`, `:61`, `:67`; `PasswordToggle.tsx:13`; `ServerError.tsx:11`; `SubmitButton.tsx:16`, `:20`. Do tego `SignUpForm.tsx:21` i 5 linii w `signup.astro` (grep palety). Żaden plik auth nie jest w `CLEANED_VIEWS` (`scripts/check-ui-literals.mjs:10-23`).
- **Musztardowe tło to autouzupełnianie przeglądarki, nie kod aplikacji:** w ścieżce logowania i w `global.css` nie ma ani jednej reguły `:autofill`/`-webkit-autofill` (grep `autofill` w `src/`: 0 trafień), a pole jest półprzezroczyste (`bg-white/10`, `FormField.tsx:6`), więc tło UA przebija. Zjawisko zgłosił użytkownik; nie odtworzyłem go zrzutem (brak przeglądarki w tej sesji) — inferencja z braku reguły i znanego zachowania `:autofill`.
- **Kolor z palety (decyzja: przyciemniony `--primary`):** rekomendowana wartość nowej roli `--autofill: oklch(0.36 0.12 302.321)` (≈ `#4a2870`, odcień `--primary`), biały tekst 11,46:1, obwódka `--ring` na tym tle 4,11:1. Wyliczenia: skrypt w § Autouzupełnianie.
- **Mechanizm:** tła autouzupełniania nie da się nadpisać `background-color`; trzeba wewnętrznego cienia + `-webkit-text-fill-color`. W Tailwind 4.3.3 `box-shadow` jest składany ze zmiennych (`var(--tw-inset-shadow), …, var(--tw-ring-shadow), var(--tw-shadow)` — potwierdzone w zbudowanym CSS `dist/client/_astro/*.css`), więc ustawienie `--tw-inset-shadow` w stanie `:autofill` zachowa obwódkę fokusu; zwykłe `box-shadow` w warstwie `base` zostałoby nadpisane przez `focus-visible:ring-*` (warstwa `utilities`) i musztarda wróciłaby przy fokusie.

## Charges

Każdy zarzut: dowód (`plik:linia`) → co powinno go pokryć → skutek dla użytkownika.

### C1 — Brakujący token: tło autouzupełniania (missing token)

- **Dowód:** pole `bg-white/10` (`FormField.tsx:6`) bez reguły `:autofill` — 0 trafień `autofill` w `src/` (`global.css` i komponenty auth). `.dark` ma `color-scheme: dark` (`global.css:47`), ale przeglądarka i tak maluje własne tło autouzupełniania (zgłoszenie użytkownika: „musztardowe”).
- **Co powinno pokryć:** nowa rola `--autofill` w `.dark` (+ publikacja `--color-autofill` w `@theme inline`), wartość z odcienia `--primary` (decyzja użytkownika), z notką źródła obok bloku; reguła w `@layer base` dla `input:autofill` / `input:-webkit-autofill`: `--tw-inset-shadow: inset 0 0 0 1000px var(--autofill)`, `-webkit-text-fill-color: var(--primary-foreground)`, `caret-color: var(--primary-foreground)`.
- **Skutek dla użytkownika:** rodzic, który loguje się zapamiętanym hasłem (najczęstsza ścieżka na telefonie), widzi pola w obcym, żółtawym kolorze, niepasującym do ciemnej palety — ekran wygląda na zepsuty dokładnie w momencie, gdy wszystko działa.

### C2 — Brakujące tokeny: karta, nagłówek, teksty i link wpisane na sztywno (missing tokens)

- **Dowód:**
  - karta `rounded-2xl border border-white/10 bg-white/10 … text-white backdrop-blur-xl` — `signin.astro:15`;
  - nagłówek gradientowy `from-blue-200 to-purple-200 bg-clip-text … text-transparent` — `signin.astro:16`;
  - tekst wyciszony `text-blue-100/60` — `:36`; etykieta `text-blue-100/80` — `FormField.tsx:41`; ikona `text-white/40` — `FormField.tsx:45`, `PasswordToggle.tsx:13`;
  - link „Zarejestruj się” `text-purple-300` — `signin.astro:40` (w aplikacji link to `--link`, `Topbar.astro:6`);
  - pole `text-white placeholder-white/40 … border-white/20 focus:ring-purple-400` — `FormField.tsx:6`, `:61`.
- **Co powinno pokryć:** `Card` + `cardClass`, `text-foreground`, `text-muted-foreground`, `text-link`, `border-input`, `placeholder:text-muted-foreground`, `--ring` — wszystkie opublikowane w `@theme inline` (`global.css:90-110`).
- **Skutek dla użytkownika:** ekran logowania to pierwszy kontakt z aplikacją, a wygląda inaczej niż panel i strony grupy (gradientowy nagłówek, inny fiolet linku, inny promień karty); każda przyszła zmiana tokenu go ominie.

### C3 — Brakujące komponenty współdzielone: pole, komunikaty i przycisk zbudowane ręcznie (missing shared component)

- **Dowód:**
  - `<input>` z własnym stringiem klas (`FormField.tsx:5-6`, `:46-63`) zamiast `ui/input` (`input.tsx:4-17`, ze stanami `focus-visible`, `aria-invalid`, `disabled`) + `inputClass` (`group-page-classes.ts`, `min-h-11`);
  - komunikat `?message=account_created` („Konto utworzone — zaloguj się”, `auth-errors.ts:23`) i komunikat zaproszenia (`signin.astro:20-33`) jako ręczne `<p>` `bg-blue-900/30` z `role="status"` — bez ikony. Komunikat o utworzonym koncie jest pozytywny: AGENTS.md § UI wymaga `<Alert variant="success">` (`--success`);
  - błąd serwera `ServerError.tsx:11` — ręczny `<p>` `bg-red-900/30 text-red-300` z ikoną, zamiast `Alert variant="destructive"` (`alert.tsx:11-12`);
  - `SubmitButton.tsx:16` nadpisuje `Button` literałami `bg-purple-600 … hover:bg-purple-500 text-white` — `--primary` ma tę samą wartość co `purple-600` (`global.css:54`), więc domyślny wariant daje ten sam kolor; spinner `border-white/30 border-t-white` (`:20`).
- **Co powinno pokryć:** `Input` + `inputClass` (z miejscem na ikonę po lewej i przełącznik hasła po prawej), `Alert` (`success` / `default` + `Info` / `destructive` + `CircleAlert`), `Button` bez nadpisań koloru (`h-auto min-h-11 w-full`), spinner na `border-primary-foreground`.
- **Skutek dla użytkownika:** potwierdzenie „Konto utworzone” i błąd „Nieprawidłowy e-mail lub hasło” różnią się na ekranie głównie kolorem tła (niebieski vs czerwony), a nie wzorem komunikatu znanym z reszty aplikacji.

### C4 — Stany fokusu i błędu poza tokenami (missing tokens / states)

- **Dowód:**
  - pole: `focus:outline-none focus:ring-2` (`FormField.tsx:6`) — fokus na `:focus` (także po kliknięciu), nie `:focus-visible`, w kolorze `purple-400` zamiast `--ring`;
  - błąd pola: `border-red-400/60 focus:ring-red-400` (`:61`) i komunikat `text-red-300` (`:67`) zamiast `--destructive`; pole ma `aria-invalid` (`:57`), ale żaden styl go nie czyta (`ui/input` czyta: `input.tsx:12`);
  - przełącznik hasła (`PasswordToggle.tsx:10-17`) i link „Zarejestruj się” (`signin.astro:38-43`) — brak klas `focus-visible:*`; jedyny styl fokusu to globalne `outline-ring/50` (`global.css:132`) — wygląd do potwierdzenia zrzutem (inferencja);
  - disabled: `SubmitButton` ma `disabled={pending}` (`:15`) i dziedziczy `disabled:opacity-50` z `buttonVariants`; pola nie mają stanu disabled.
- **Co powinno pokryć:** `ui/input` (`focus-visible:ring-ring/50`, `aria-invalid:border-destructive`), `text-destructive` dla komunikatu pola, `focusRingClass` dla przełącznika i linku.
- **Skutek dla użytkownika:** użytkownik klawiatury nie widzi wyraźnie fokusu na „Pokaż hasło” i „Zarejestruj się”; kolor błędu pola nie podąża za `--destructive`, a obwódka błędu jest półprzezroczysta (60 %).

### C5 — Przypadkowa architektura i brak guardu (accidental architecture)

- **Dowód:**
  - zalogowany użytkownik na `/auth/signin` widzi formularz logowania: middleware przekierowuje tylko chronione trasy na `/auth/signin` (`middleware.ts:53`), a `signin.astro:1-11` nie sprawdza `Astro.locals.user` — inferencja z kodu, nie sprawdzone `curl`;
  - komponenty auth są współdzielone z rejestracją (`SignUpForm.tsx:3-6`, 6 użyć `FormField` `:78-164`) — zmiana `FormField`/`ServerError`/`SubmitButton` zmieni też `/auth/signup`, którego strona (`signup.astro`, 5 linii z literałami) zostanie na starej karcie z gradientem, jeśli nie wejdzie do zakresu;
  - brak kitchen sinka z 7 stanami (w tym autouzupełnianie, błąd pola, komunikaty) i brak wpisów w `CLEANED_VIEWS` (`check-ui-literals.mjs:10-23`);
  - smoke nie czyta HTML stron `/auth/*` (grep `request("/auth/` w `scripts/smoke.mjs`: 0 trafień) — pilnuje tylko przekierowań API (`smoke.mjs:46-50`, `:234-236`), więc treść i struktura strony nie są niczym chronione.
- **Skutek dla użytkownika:** rodzic z aktywną sesją, który otworzy zakładkę „Logowanie”, dostaje formularz zamiast panelu; po tej zmianie logowanie i rejestracja wyglądałyby różnie, jeśli `signup.astro` zostanie poza zakresem; regresja literałów w auth przejdzie lint.
- **Status:** przekierowanie zalogowanego i zakres `signup.astro` — do decyzji w `/10x-plan` (Open Questions 1–2).

## Detailed Findings

### Źródło → widok

- Tokeny: `.dark` zawsze aktywne (AGENTS.md § UI), wartości `global.css:46-83`, publikacja `:85-124`, `bg-cosmic` `:126-128`, warstwa bazowa `:130-137`.
- Klasy ról w ścieżce logowania: 0 (poza `bg-cosmic`, `signin.astro:14`).
- Importy z `src/components/ui/`: 1 (`Button` w `SubmitButton.tsx:2`); `ui/input.tsx` istnieje, ale auth go nie używa.

### Widok → źródło (mapowanie literałów)

| Linia | Literał | Rola / komponent |
| --- | --- | --- |
| `signin.astro:15` | `border-white/10 bg-white/10 text-white rounded-2xl` | `Card` + `cardClass` (`--card`, `--border` = literał, `global.css:50`, `:66`) |
| `signin.astro:16` | gradient `from-blue-200 to-purple-200` | `text-foreground` (widoczna zmiana: bez gradientu) |
| `signin.astro:21`, `:29` | `border-blue-300/30 bg-blue-900/30 text-blue-100` | `Alert` (`success` dla `account_created`, `default` + `Info` dla zaproszenia) |
| `signin.astro:36` | `text-blue-100/60` | `text-muted-foreground` (70 %, o 10 pp jaśniej) |
| `signin.astro:40` | `text-purple-300` | `text-link` + `focusRingClass` |
| `FormField.tsx:6` | `bg-white/10 text-white placeholder-white/40 focus:ring-purple-400` | `Input` + `inputClass` (`dark:bg-input/30`, `placeholder:text-muted-foreground`, `focus-visible:ring-ring/50`) |
| `FormField.tsx:41` | `text-blue-100/80` | `labelClass` (`text-muted-foreground`) |
| `FormField.tsx:45`, `PasswordToggle.tsx:13` | `text-white/40`, `hover:text-white/70` | `text-muted-foreground`, `hover:text-foreground` |
| `FormField.tsx:61`, `:67` | `border-red-400/60`, `text-red-300` | `aria-invalid:border-destructive` (z `Input`), `text-destructive` |
| `ServerError.tsx:11` | `border-red-500/30 bg-red-900/30 text-red-300` | `Alert variant="destructive"` |
| `SubmitButton.tsx:16`, `:20` | `bg-purple-600 hover:bg-purple-500 text-white`, `border-white/30 border-t-white` | `Button` (wariant `default` = `bg-primary`), spinner `border-primary-foreground/30 border-t-primary-foreground` |
| `SignUpForm.tsx:21` | `text-blue-100/50` | `text-muted-foreground` (rejestracja — zakres do decyzji) |

### Autouzupełnianie — wyliczenie koloru

Skrypt `autofill-colour.mjs` (scratchpad sesji; oklch → sRGB, kompozycja alfa, kontrast WCAG) dla tła `bg-cosmic` środkowego (`#0f1529`, `global.css:127`), karty `white/10` i pola `white/10` na karcie:

| Wariant | Kolor | Biały tekst | `--ring` vs tło |
| --- | --- | --- | --- |
| puste pole (dziś) | `#3d4152` | 10,08:1 | — |
| `--primary` 20 % na polu | `#4f3873` | 9,83:1 | 3,52:1 |
| `--primary` 30 % na polu | `#583384` | 9,48:1 | 3,40:1 |
| `--primary` 40 % na polu | `#612e95` | 9,01:1 | 3,23:1 |
| **`oklch(0.36 0.12 302.321)`** (rekomendacja) | `#4a2870` | **11,46:1** | **4,11:1** |
| `oklch(0.33 0.12 302.321)` | `#422067` | 12,87:1 | 4,61:1 |
| `oklch(0.40 0.12 302.321)` | `#55347c` | 9,72:1 | 3,49:1 |

- Wszystkie warianty przechodzą AA dla tekstu (≥ 4,5:1) i 3:1 dla obwódki fokusu. Rekomendacja `L 0.36` łączy wyraźnie fioletowy odcień `--primary` (hue 302,321 bez zmian) z najlepszym kompromisem kontrastu; wartość w oklch jak reszta `.dark`.
- Wartość musi być nieprzezroczysta: wewnętrzny cień przykrywa tło UA tylko wtedy, gdy nie ma kanału alfa (półprzezroczysty cień pokazałby mieszankę z musztardą).
- `--tw-inset-shadow` (Tailwind 4.3.3, `node_modules/tailwindcss/package.json`) jest składową `box-shadow` w zbudowanym CSS (`dist/client/_astro/*.css`: `box-shadow:var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)`), więc działa z `Input` (`shadow-xs`) i jego `focus-visible:ring-[3px]`. Do potwierdzenia w przeglądarce (Edge/Chrome) — inferencja z CSS.

### Baseline 7 stanów

| Stan | Stan obecny |
| --- | --- |
| default | literały palety (C2), 0 tokenów |
| hover | przycisk `hover:bg-purple-500`, przełącznik `hover:text-white/70`, link `hover:underline` — literały |
| focus-visible | pole na `:focus` `purple-400` (C4); przełącznik i link bez własnego stylu |
| disabled | przycisk `disabled={pending}` + `disabled:opacity-50` (z `buttonVariants`); pola bez stanu |
| error | błąd pola: czerwona obwódka 60 % + ikona + tekst (`FormField.tsx:61-70`); błąd serwera `ServerError` (ikona + tekst) — literały |
| empty | N/A dla formularza; odpowiednik: puste pola z placeholderem; dodatkowo stan **autouzupełniony** (C1) |
| loading | przycisk „Logowanie...” ze spinnerem (`SubmitButton.tsx:18-22`); wyspa `client:load` — zawartość SSR, brak przeskoku |

## Code References

- `src/pages/auth/signin.astro:13-47` — strona: karta, nagłówek, komunikaty, wyspa, link do rejestracji
- `src/components/auth/FormField.tsx:5-76` — pole z ikoną, błędem, `aria-invalid`
- `src/components/auth/SignInForm.tsx:50-98` — formularz POST, walidacja zod po stronie klienta
- `src/components/auth/{PasswordToggle,ServerError,SubmitButton}.tsx` — przełącznik, błąd serwera, przycisk ze spinnerem
- `src/components/auth/SignUpForm.tsx:3-6`, `:21` — współdzielenie komponentów, literał podpowiedzi
- `src/lib/services/auth-errors.ts:6-24` — teksty błędów i komunikatów
- `src/pages/api/auth/signin.ts:10-45` — przekierowania `?error=`, `?invite=`, `/dashboard`
- `src/components/ui/input.tsx:4-17`, `ui/alert.tsx:5-47`, `ui/button.tsx:7-32` — komponenty kontraktu
- `src/styles/global.css:46-83`, `:85-124`, `:130-137` — tokeny, publikacja, warstwa bazowa
- `src/components/groups/group-page-classes.ts` — `inputClass`, `labelClass`, `focusRingClass`, `cardClass`
- `scripts/check-ui-literals.mjs:10-23` — `CLEANED_VIEWS`
- `src/middleware.ts:53` — przekierowanie chronionych tras na logowanie

## Architecture Insights

- To pierwsza zmiana `/10x-ui`, która dodaje nową rolę od `event-plan-ui` (`--success`): `--autofill`. Warstwa tokenów wymaga wartości (z notką źródła i plikiem wartości w folderze zmiany) i reguły w `@layer base` — nie klas w widoku.
- `FormField` jest kontrolowanym komponentem React z ikoną i `endContent`; przejście na `Input` zachowa tę strukturę (ikona i przełącznik absolutnie pozycjonowane), zmieni tylko klasy pola.
- Reguła `:autofill` w `global.css` zadziała globalnie — także dla pól strony grupy i panelu admina, które używają `Input` lub `inputClass`; to pożądane (jedno źródło), ale zmienia wygląd autouzupełniania poza `/auth/signin`.
- Stałe `group-page-classes.ts` są już używane poza widokami grupy (panel); auth byłby kolejnym konsumentem.

## Historical Context (from prior changes)

- `context/archive/2026-11-16-group-page-ui/research.md:73-77` — `focus:ring-purple-400` w 7 plikach (m.in. `auth/FormField.tsx`) i kontrolowany `FormField` niepasujący do formularzy SSR (supported: `FormField.tsx:12-22`); wtedy dodano `ui/input` (supported: `input.tsx` istnieje).
- `context/archive/2026-11-16-group-page-ui/research.md:85` — `ServerError` pokrywa tylko wariant błędu z ikoną (supported: `ServerError.tsx:7-15`).
- `context/archive/2026-11-16-group-page-ui/research.md:97-99` — adres powrotu po logowaniu odroczony jako zmiana auth, nie UI (still deferred: `api/auth/signin.ts:45` bez zmian).
- `context/archive/2026-11-17-event-plan-ui/` — precedens nowej roli tokenu (`--success`, `global.css:63-65`, notka źródła `tokens.md`).
- `a6bd7ba` „Polish auth UI and show profile on dashboard (p3)” — źródło karty auth z gradientem (supported: `signin.astro:14-16`).

## Related Research

- `context/archive/2026-11-17-dashboard-ui/research.md` — ten sam szablon karty-literału (panel przed zmianą).
- `context/archive/2026-11-16-group-page-ui/research.md` — pole formularza i komunikaty.

## Open Questions

1. Zakres: dołączyć `signup.astro` (+ `SignUpForm.tsx:21`) do tej zmiany, skoro komponenty auth i tak się zmienią? Zalecane: tak — inaczej rejestracja zostanie ze starą kartą przy nowych polach.
2. Zalogowany na `/auth/signin`: przekierować na `/dashboard` (C5), czy zostawić jako deferred (zmiana zachowania auth, nie wyglądu)?
3. Wartość `--autofill`: `oklch(0.36 0.12 302.321)` (rekomendacja), ciemniejsza `L 0.33`, czy jaśniejsza `L 0.40` — do potwierdzenia na zrzucie.
4. Układ strony: zostaje wyśrodkowana karta `max-w-sm` (typowe dla logowania), czy `Topbar` jak w widokach zalogowanych? Zalecane: karta zostaje — `Topbar` dla wylogowanego pokazuje tylko „Zaloguj się / Zarejestruj się”.
5. Do potwierdzenia w przeglądarce: że `--tw-inset-shadow` przykrywa tło autouzupełniania w Edge i Chrome i że obwódka fokusu zostaje widoczna na autouzupełnionym polu.
