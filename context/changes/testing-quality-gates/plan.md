# Bramki jakości (rollout Phase 5) — plan implementacji

## Overview

Faza 5 planu testów ma pilnować, żeby podłoga testów z faz 1–4 nie spadła. Nie
dokładamy jobów CI, bo istniejące już blokują merge. Zamiast tego (1) dodajemy
jedną bramkę statyczną: regułę ESLint „ciało żądania w `src/pages/api` czytane
tylko przez `clone()`”, (2) dowodzimy celowym zepsuciem, że każda warstwa
czerwieni CI i że ruleset blokuje merge, (3) wpinamy dwustopniowy hook agenta
Claude Code: po edycji i na koniec tury.

## Current State Analysis

Źródło: `context/changes/testing-quality-gates/research.md`.

- Job `ci` uruchamia lint (ESLint + `check-ui-literals`), `astro check`,
  Vitest i build (`.github/workflows/ci.yml:10-26`). Job `smoke` uruchamia
  `supabase test db` (z `rls_catalog_guard.test.sql`), build i smoke
  (`ci.yml:28-60`).
- Ruleset `protect-main` wymaga statusów `ci` i `smoke`, strict, bez bypass
  (`gh api repos/pstawik/carpooling/rulesets/26843888`). Na GitHubie nie było
  jeszcze czerwonego przebiegu z powodu testu, więc blokada jest dziś wnioskiem
  z konfiguracji, nie obserwacją.
- Hooka agenta nie ma: brak `.claude/settings.json`, `settings.local.json`
  zawiera tylko `permissions`. Lokalnie działa tylko husky → lint-staged
  (`eslint --fix`, `prettier --write`).
- Pomiar na Windows: `eslint <plik>` zajmuje 14–37 s, `vitest related <plik>
  --run` 5,3 s.
- 12/12 endpointów z `rewrite(` czyta `context.request.clone().formData()`.
  Odczyt bez `clone()` mają tylko `src/pages/api/auth/signin.ts:16`,
  `src/pages/api/auth/signup.ts:16` i `src/pages/api/groups/join.ts:11` (grep
  po `.(formData|json|text|arrayBuffer|blob)(` w `src/pages/api`, 2026-11-19).

## Desired End State

- `npm run lint` jest czerwony, gdy plik w `src/pages/api/**` czyta ciało
  żądania inaczej niż przez `….clone().<metoda>()`. Dotyczy to także aliasu
  `const req = context.request; req.formData()`. Wszystkie 15 endpointów
  przechodzi.
- `context/changes/testing-quality-gates/gate-proofs.md` zapisuje dla każdej
  warstwy komendę, celowe zepsucie, kod wyjścia i przywrócenie. Zapisuje też
  numer PR na GitHubie z `mergeStateStatus=BLOCKED` i czerwonymi `ci` oraz
  `smoke`. PR jest zamknięty bez merge.
- `.claude/settings.json` (commitowany) ma dwa hooki:
  - PostToolUse po Edit/Write pliku `src/**/*.{ts,tsx}` uruchamia `vitest
    related` i zgłasza czerwień agentowi (exit 2);
  - Stop uruchamia ESLint na zmienionych plikach i `check-ui-literals`, a przy
    błędzie zatrzymuje zakończenie tury.

  Oba hooki są udowodnione na zepsutym i zielonym pliku.
- `context/foundation/test-plan.md` §5, §6.4 i §6.5 oraz `AGENTS.md` opisują
  nowe bramki.

### Key Discoveries:

- `eslint.config.js:83` ignoruje `.claude/`, a `scripts/**/*.mjs` są lintowane
  bez type-checkingu (`eslint.config.js:73-80`). Skrypty hooków umieszczamy więc
  w `scripts/hooks/`, żeby podlegały lintowi.
- Wzorzec odczytu ciała: `src/pages/api/groups/invite.ts:14-19`, czyli
  `clone().formData()` w `try/catch` z `rewrite("/404")` w `catch`.
- Smoke kończy się `process.exit(failed ? 1 : 0)` (`scripts/smoke.mjs:781`).
  Vitest nie ma `passWithNoTests` (`vitest.config.ts:9-12`).

## What We're NOT Doing

- Nie dodajemy jobów ani kroków CI. Istniejące joby `ci`/`smoke` już pokrywają
  każdą warstwę.
- Nie wprowadzamy strażnika „każdy endpoint z `rewrite` ma krok 404 w smoke”.
  To zostaje punktem checklisty §6.4 (decyzja planu).
- Nie piszemy skryptu grep dla reguły `clone()`. Tekstowe dopasowanie
  przepuszcza alias `request`.
- Nie uruchamiamy ESLinta, pgTAP ani smoke po każdej edycji. ESLint idzie do
  Stop, a pgTAP i smoke zostają w CI.
- Nie zmieniamy hooka husky/lint-staged ani nie dodajemy pre-push.
- Nie aktualizujemy statusu §3 w `test-plan.md`. Robi to `/10x-test-plan`
  przy uzgadnianiu fazy.

## Implementation Approach

Kolejność: najpierw bramka (faza 1), bo dowód CI w fazie 2 obejmuje także ją.
Hook (faza 3) idzie na końcu, bo jego Stop korzysta z ESLinta z nową regułą.
Każda bramka ma dowód „czerwony na zepsutym, zielony po przywróceniu”.

## Critical Implementation Details

- **Draft PR nie pokaże `BLOCKED`.** Dla draftu GitHub zwraca
  `mergeStateStatus=DRAFT`. Po zakończeniu checków trzeba wykonać `gh pr ready`
  i dopiero wtedy odczytać `BLOCKED`. Potem zamykamy PR (`gh pr close
  --delete-branch`) i nigdy nie wołamy `gh pr merge`. Przed odczytem
  potwierdzić `headRefOid` == lokalny HEAD gałęzi dowodu.
- **Gałąź dowodu odchodzi od `main`**, nie od `testing-quality-gates`. Diff PR
  ma zawierać tylko commit z zepsuciem.
- **Job `smoke` zatrzyma się na pgTAP**, więc krok smoke nie uruchomi się w tym
  PR. Czerwień samego `npm run smoke` dowodzimy lokalnie.
- **Hook Stop musi respektować `stop_hook_active`.** Przy `true` kończy z exit
  0, żeby nie zapętlić tury. Skrypty hooków są w Node (`.mjs`), nie w bashu,
  bo repo jest rozwijane na Windows.

## Faza 1: Reguła ESLint „`clone()` przed `rewrite`”

### Overview

Bramka statyczna dla mechanizmu błędu z fazy 4 (`RewriteWithBodyUsed` → 500).
Obejmuje wszystkie pliki API, więc endpoint, który doda `rewrite` później, jest
chroniony od pierwszej linii.

### Changes Required:

#### 1. Konfiguracja ESLint

**File**: `eslint.config.js`

**Intent**: Dodać blok konfiguracji dla `src/pages/api/**/*.ts` z regułą
`no-restricted-syntax`. Reguła zakazuje wywołań metod czytających ciało, gdy
ich obiekt nie jest bezpośrednim wywołaniem `clone()`. Komunikat odsyła do
§6.4 i wzorca w `invite.ts`.

**Contract**: Nowy obiekt w `defineConfig(...)` przed `eslintPluginPrettier`.
Żaden inny blok nie ustawia `no-restricted-syntax`, więc nie ma konfliktu.
Selektor (nieoczywisty, dlatego podany):

```js
{
  selector:
    "CallExpression[callee.type='MemberExpression'][callee.property.name=/^(formData|json|text|arrayBuffer|blob)$/]" +
    ":not([callee.object.type='CallExpression'][callee.object.callee.property.name='clone'])",
  message:
    "Read the request body via context.request.clone().<method>() — rewrite(\"/404\") after reading the original body throws RewriteWithBodyUsed (500). See context/foundation/test-plan.md §6.4.",
}
```

Świadomy fałszywy alarm: `const c = context.request.clone(); c.formData()`
też jest czerwony. Komunikat wymusza zapis inline i tak ma zostać.

#### 2. Endpointy bez `clone()`

**File**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`,
`src/pages/api/groups/join.ts`

**Intent**: Przepisać odczyt ciała na `context.request.clone().formData()`.
Zachowanie się nie zmienia (te endpointy nie robią `rewrite`). Po tej zmianie
reguła obowiązuje bez wyjątków.

**Contract**: `try/catch` wokół odczytu zostaje bez zmian. Smoke dla
logowania, rejestracji i dołączania pozostaje zielony.

#### 3. Dowód reguły

**File**: `context/changes/testing-quality-gates/gate-proofs.md` (nowy)

**Intent**: Zapisać dowód: (a) usunięcie `.clone()` w
`src/pages/api/groups/invite.ts` czerwieni `npx eslint` z komunikatem reguły;
(b) alias `const req = context.request; await req.formData()` w tym samym
pliku też czerwieni; (c) po `git checkout -- <plik>` lint jest zielony.

**Contract**: Sekcja „Reguła clone()” z komendą, zepsuciem, kodem wyjścia i
pierwszą linią komunikatu dla (a) i (b).

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi na wszystkich 15 endpointach
- `npx astro check` przechodzi
- `npm test` przechodzi
- Usunięcie `.clone()` w `src/pages/api/groups/invite.ts` daje czerwony `npx eslint src/pages/api/groups/invite.ts` z komunikatem reguły
- Alias `const req = context.request; req.formData()` daje czerwony `npx eslint` na tym pliku

#### Manual Verification:

- Smoke dla signin/signup/join zielony lokalnie (`npm run smoke` na działającym serwerze) albo w jobie `smoke` PR

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na
potwierdzenie testu ręcznego.

---

## Faza 2: Dowód czerwieni CI

### Overview

Udowodnić, że każda warstwa kończy się kodem ≠ 0, a czerwony job blokuje merge
na GitHubie. Nic z tej fazy nie trafia do `main` poza `gate-proofs.md`.

### Changes Required:

#### 1. Lokalne celowe zepsucia

**File**: `context/changes/testing-quality-gates/gate-proofs.md`

**Intent**: Dla każdej warstwy wprowadzić jedno zepsucie, uruchomić komendę z
CI, zapisać kod wyjścia i przywrócić (`git checkout -- <plik>`, a po migracji
`npx supabase db reset`). Lista warstw:
- Vitest: odwrócona asercja w `src/lib/services/group-errors.test.ts` → `npm test`.
- pgTAP: zmieniona oczekiwana wartość w `supabase/tests/engagement_stats_boundaries.test.sql` → `npx supabase test db`.
- Strażnik RLS: tymczasowa migracja z tabelą `public` bez RLS → `npx supabase db reset` + `npx supabase test db`, czerwony `rls_catalog_guard`.
- Smoke: zmieniony oczekiwany status jednego kroku w `scripts/smoke.mjs` → `npm run smoke`.
- `check-ui-literals`: klasa palety (`bg-purple-600`) w pliku z `CLEANED_VIEWS` → `npm run lint`.
- `astro check`: błąd typu w pliku `src/lib/` → `npx astro check`.
- Build: niewykonalny import w `src/pages/` → `npm run build`.

**Contract**: Tabela „Warstwa | Zepsucie | Komenda | Exit | Przywrócono”, po
jednym wierszu na warstwę. Każdy wiersz ma exit ≠ 0. Po wszystkich
przywróceniach `git status` pokazuje tylko `gate-proofs.md` (i zmiany faz 1/3).

#### 2. PR dowodowy na GitHubie

**File**: brak zmian w repo (gałąź tymczasowa `testing-quality-gates-red-proof` od `main`)

**Intent**: Jeden commit z odwróconą asercją Vitest i zepsutą asercją pgTAP,
otwarty jako draft PR do `main`. Po zakończeniu checków wykonać `gh pr ready`,
odczytać `gh pr view --json mergeStateStatus,statusCheckRollup,headRefOid` i
zamknąć PR z usunięciem gałęzi.

**Contract**: Wynik w `gate-proofs.md`: numer PR, `ci`=FAILURE,
`smoke`=FAILURE, `mergeStateStatus=BLOCKED`, `headRefOid` zgodny z lokalnym
commitem, stan `CLOSED` bez merge.

### Success Criteria:

#### Automated Verification:

- Każda z 7 warstw w `gate-proofs.md` ma exit ≠ 0 na zepsuciu i exit 0 po przywróceniu
- PR dowodowy: `statusCheckRollup` pokazuje `ci` i `smoke` jako FAILURE
- PR dowodowy po `gh pr ready`: `mergeStateStatus` = `BLOCKED`
- PR dowodowy zamknięty bez merge, gałąź `testing-quality-gates-red-proof` usunięta lokalnie i zdalnie
- `git status` po fazie nie zawiera żadnego zepsucia

#### Manual Verification:

- Na stronie PR przycisk merge jest zablokowany z komunikatem o wymaganych checkach

**Implementation Note**: Utworzenie PR to akcja zewnętrzna zatwierdzona w
planowaniu. Przed `gh pr ready` potwierdź `headRefOid`.

---

## Faza 3: Hook agenta i domknięcie planu testów

### Overview

Pętla agenta łapie regresje w chwili edycji (Vitest) i na koniec tury
(ESLint z regułą z fazy 1 oraz `check-ui-literals`). Konfiguracja przez
`/10x-configure-hook`, który dowodzi każdego skryptu zepsutym plikiem.

### Changes Required:

#### 1. Hook po edycji

**File**: `scripts/hooks/post-edit-vitest.mjs` (nowy), `.claude/settings.json` (nowy)

**Intent**: PostToolUse z matcherem `Edit|Write|MultiEdit`. Skrypt czyta JSON
ze stdin (`tool_input.file_path`). Dla plików `src/**/*.{ts,tsx}` uruchamia
`npx vitest related <plik> --run`, a dla innych plików kończy z exit 0. Przy
czerwieni wypisuje zwięzły wynik na stderr i kończy z exit 2, żeby agent go
zobaczył.

**Contract**: Exit 0 = zielono lub pominięto, exit 2 = czerwone testy. Brak
testów powiązanych z plikiem to exit 0, a nie błąd.

#### 2. Hook końca tury

**File**: `scripts/hooks/stop-lint.mjs` (nowy), `.claude/settings.json`

**Intent**: Stop. Gdy `stop_hook_active` = true, skrypt kończy z exit 0.
Inaczej zbiera zmienione pliki (`git diff --name-only HEAD` + nieśledzone,
filtr `*.{ts,tsx,astro,mjs}`, z pominięciem `.claude/`) i uruchamia na nich
`npx eslint`. Potem uruchamia `node scripts/check-ui-literals.mjs`. Przy
błędzie wypisuje wynik na stderr i kończy z exit 2, co blokuje zakończenie
tury.

**Contract**: Brak zmienionych plików ESLint → pomija ESLint, ale
`check-ui-literals` i tak działa (sekundy).

#### 3. Dowód hooków

**File**: `context/changes/testing-quality-gates/gate-proofs.md`

**Intent**: Zapisać przebiegi każdego skryptu na spreparowanym stdin:
- post-edit na pliku z czerwonym testem → exit 2, na zielonym → 0, na `README.md` → 0;
- stop z błędem ESLint w zmienionym pliku → exit 2, z `stop_hook_active: true` → 0, na czystym drzewie → 0.

**Contract**: Sekcja „Hooki” w tabeli jak w fazie 2.

#### 4. Dokumentacja bramek

**File**: `context/foundation/test-plan.md`, `AGENTS.md`

**Intent**:
- §5: wiersz „post-edit hook” → aktywny od fazy 5, z opisem dwóch momentów; nowy wiersz „reguła ESLint `clone()` w `src/pages/api`” (local + CI, required).
- §6.4, checklist pkt 1: dodać „pilnuje tego `npm run lint`”.
- §6.5: notatka „Faza 5” z wynikiem dowodów i numerem PR dowodowego.
- `AGENTS.md`, sekcja Commands lub Testing: jedno zdanie o hookach w `.claude/settings.json`.

**Contract**: Edycje tylko w wymienionych sekcjach. §3 bez zmian.

### Success Criteria:

#### Automated Verification:

- `scripts/hooks/post-edit-vitest.mjs`: exit 2 na pliku z czerwonym testem, exit 0 na zielonym i na `README.md`
- `scripts/hooks/stop-lint.mjs`: exit 2 przy błędzie ESLint w zmienionym pliku, exit 0 przy `stop_hook_active: true` i na czystym drzewie
- `npm run lint` przechodzi (skrypty hooków lintowane w `scripts/`)
- `.claude/settings.json` jest poprawnym JSON-em z hookami PostToolUse i Stop

#### Manual Verification:

- W nowej sesji Claude Code edycja z czerwonym testem pokazuje agentowi wynik hooka, a agent na niego reaguje
- Czas hooka po edycji akceptowalny w codziennej pracy (~5 s)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na
potwierdzenie testu ręcznego w żywej sesji.

---

## Testing Strategy

### Unit Tests:

- Brak nowych testów jednostkowych. Bramki dowodzimy celowym zepsuciem
  (`gate-proofs.md`), a nie testami testów.

### Integration Tests:

- PR dowodowy na GitHubie (faza 2) to jedyny test integracji z rulesetem.

### Manual Testing Steps:

1. Zepsuj `.clone()` w jednym endpoincie: `npm run lint` czerwony, po przywróceniu zielony.
2. Otwórz stronę PR dowodowego przed zamknięciem: merge zablokowany.
3. W sesji Claude Code zepsuj asercję w teście obok edytowanego modułu: hook zgłasza czerwień.

## Performance Considerations

Hook po edycji kosztuje ~5 s (`vitest related`, pomiar w research). ESLint
(14–37 s) uruchamiany jest raz na turę w Stop, a nie po każdej edycji.

## Migration Notes

Nie dotyczy. Tymczasowa migracja z fazy 2 jest usuwana przed commitem i
odwracana przez `npx supabase db reset`.

## References

- Research: `context/changes/testing-quality-gates/research.md`
- Plan testów: `context/foundation/test-plan.md` §5, §6.4, §6.5
- Wzorzec odczytu ciała: `src/pages/api/groups/invite.ts:14-19`
- Poprzednia faza: `context/archive/2026-11-19-testing-api-error-paths/`
- Skill hooków: `.claude/skills/10x-configure-hook/SKILL.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła ESLint „clone() przed rewrite”

#### Automated

- [x] 1.1 `npm run lint` przechodzi na wszystkich 15 endpointach — 920d699
- [x] 1.2 `npx astro check` przechodzi — 920d699
- [x] 1.3 `npm test` przechodzi — 920d699
- [x] 1.4 Usunięcie `.clone()` w `src/pages/api/groups/invite.ts` daje czerwony `npx eslint src/pages/api/groups/invite.ts` z komunikatem reguły — 920d699
- [x] 1.5 Alias `const req = context.request; req.formData()` daje czerwony `npx eslint` na tym pliku — 920d699

#### Manual

- [x] 1.6 Smoke dla signin/signup/join zielony lokalnie (`npm run smoke` na działającym serwerze) albo w jobie `smoke` PR — 920d699

### Phase 2: Dowód czerwieni CI

#### Automated

- [x] 2.1 Każda z 7 warstw w `gate-proofs.md` ma exit ≠ 0 na zepsuciu i exit 0 po przywróceniu
- [x] 2.2 PR dowodowy: `statusCheckRollup` pokazuje `ci` i `smoke` jako FAILURE
- [x] 2.3 PR dowodowy po `gh pr ready`: `mergeStateStatus` = `BLOCKED`
- [x] 2.4 PR dowodowy zamknięty bez merge, gałąź `testing-quality-gates-red-proof` usunięta lokalnie i zdalnie
- [x] 2.5 `git status` po fazie nie zawiera żadnego zepsucia

#### Manual

- [x] 2.6 Na stronie PR przycisk merge jest zablokowany z komunikatem o wymaganych checkach

### Phase 3: Hook agenta i domknięcie planu testów

#### Automated

- [ ] 3.1 `scripts/hooks/post-edit-vitest.mjs`: exit 2 na pliku z czerwonym testem, exit 0 na zielonym i na `README.md`
- [ ] 3.2 `scripts/hooks/stop-lint.mjs`: exit 2 przy błędzie ESLint w zmienionym pliku, exit 0 przy `stop_hook_active: true` i na czystym drzewie
- [ ] 3.3 `npm run lint` przechodzi (skrypty hooków lintowane w `scripts/`)
- [ ] 3.4 `.claude/settings.json` jest poprawnym JSON-em z hookami PostToolUse i Stop

#### Manual

- [ ] 3.5 W nowej sesji Claude Code edycja z czerwonym testem pokazuje agentowi wynik hooka, a agent na niego reaguje
- [ ] 3.6 Czas hooka po edycji akceptowalny w codziennej pracy (~5 s)
