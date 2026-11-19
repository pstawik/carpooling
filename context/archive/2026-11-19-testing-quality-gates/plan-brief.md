# Bramki jakości (rollout Phase 5) — Plan Brief

> Full plan: `context/changes/testing-quality-gates/plan.md`
> Research: `context/changes/testing-quality-gates/research.md`

## What & Why

Fazy 1–4 zbudowały podłogę testów: Vitest, pgTAP ze strażnikiem RLS i smoke z
krokami 404. Faza 5 ma pilnować, żeby ta podłoga nie spadła. Każda czerwona
warstwa ma blokować merge, i to udowodnione, a nie tylko zakładane z
konfiguracji. Agent ma widzieć regresje w chwili edycji. Dochodzi też bramka na
błąd z fazy 4: odczyt ciała żądania bez `clone()` przed `rewrite("/404")` daje
500.

## Starting Point

Joby CI `ci` i `smoke` uruchamiają już wszystkie warstwy, a ruleset
`protect-main` wymaga obu (strict, bez bypass). Na GitHubie nie było jednak
jeszcze czerwonego przebiegu z powodu testu. Hooka agenta nie ma. Reguła
`clone()` istnieje tylko w checkliście §6.4: 12/12 endpointów z `rewrite` ją
spełnia, a `signin`/`signup`/`join` nie.

## Desired End State

`npm run lint` odrzuca każdy odczyt ciała w `src/pages/api/**` bez `clone()`,
także przez alias. `gate-proofs.md` zawiera dowód exit ≠ 0 dla 7 warstw i
zamknięty PR z `mergeStateStatus=BLOCKED`. W Claude Code edycja pliku TS
uruchamia powiązane testy, a koniec tury uruchamia ESLint i `check-ui-literals`.
Czerwień wraca do agenta.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Nowe joby CI | Brak — tylko dowód | Ruleset i joby już pokrywają każdą warstwę; nowy job dublowałby sygnał | Research |
| Forma reguły `clone()` | ESLint `no-restricted-syntax` na całe `src/pages/api` | AST łapie alias `request`, a grep by go przepuścił; wchodzi do `npm run lint` i lint-staged | Plan |
| signin/signup/join | Przepisane na `clone()` | Reguła bez wyjątków chroni endpoint, który doda `rewrite` później | Plan |
| Dowód blokady merge | Lokalnie 7 warstw + 1 PR (ci + smoke) → `gh pr ready` → BLOCKED → zamknięcie | Pierwsza obserwacja blokady; jeden PR wystarcza dla obu jobów | Plan |
| Moment hooków | PostToolUse: `vitest related` (~5 s); Stop: ESLint na zmienionych + `check-ui-literals` | ESLint trwa 14–37 s na plik, więc raz na turę, nie po każdej edycji | Plan + Research (pomiar) |
| Strażnik krok 404 ↔ endpoint | Nie — zostaje checklista §6.4 | Wymagałby refaktoru ~25 kroków smoke; reguła ESLint pilnuje samego mechanizmu błędu | Plan |

## Scope

**In scope:**
- Reguła ESLint + 3 endpointy na `clone()`
- `gate-proofs.md` z lokalnymi zepsuciami i PR dowodowym
- `.claude/settings.json` + `scripts/hooks/*.mjs` (przez `/10x-configure-hook`)
- §5, §6.4, §6.5 `test-plan.md` i jedno zdanie w `AGENTS.md`

**Out of scope:**
- Nowe joby CI, pre-push, zmiany husky
- Strażnik kroków 404 w smoke
- pgTAP/smoke w hooku
- Status §3 (to zadanie `/10x-test-plan`)

## Architecture / Approach

Trzy momenty, każdy z innym kosztem:
- edycja → `vitest related` (sekundy);
- koniec tury → ESLint z nową regułą i `check-ui-literals` (dziesiątki sekund, raz);
- PR → pełne CI (`ci` + `smoke`), wymagane przez ruleset.

Każda bramka ma dowód „czerwona na zepsutym, zielona po przywróceniu”.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reguła ESLint `clone()` | Lint odrzuca odczyt ciała bez `clone()` | Selektor zbyt szeroki lub wąski; dowód aliasem i usunięciem `clone()` |
| 2. Dowód czerwieni CI | `gate-proofs.md` + zamknięty PR z BLOCKED | Draft zwraca `DRAFT`, nie `BLOCKED`, więc najpierw `gh pr ready`; zepsucie przypadkiem zostaje w drzewie |
| 3. Hook agenta + dokumentacja | Hooki PostToolUse/Stop z dowodem, opisane w §5/§6.5 | Pętla w Stop bez `stop_hook_active`; czas hooka na Windows |

**Prerequisites:** lokalny Supabase (`npx supabase start`), `.dev.vars`, `gh` z dostępem do repo.
**Estimated effort:** ~1–2 sesje w 3 fazach (jeden przebieg CI w fazie 2).

## Open Risks & Assumptions

- Zakładamy, że `vitest related` mieści się w ~5 s także dla modułów z wieloma zależnymi testami.
- Smoke nie uruchomi się w PR dowodowym (job zatrzymuje się na pgTAP), więc jego czerwień dowodzimy lokalnie.

## Success Criteria (Summary)

- Odczyt ciała bez `clone()` w API nie przejdzie lintu ani CI.
- Jest zapisany dowód, że czerwony test blokuje merge do `main`.
- Agent dostaje sygnał o czerwonym teście w chwili edycji, a o lincie na koniec tury.
