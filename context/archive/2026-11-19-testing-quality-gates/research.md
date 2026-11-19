---
date: 2026-11-19T09:55:54+01:00
researcher: Claude (Opus 5.5)
git_commit: 5617cc730b5ccf0928c8bef74ff2ff75ff3b91d0
branch: testing-quality-gates
repository: carpooling
topic: "Bramki jakości — czy każda warstwa testów z faz 1–4 czerwieni CI, jaki hook po edycji ma sens i czy reguła „clone() przed rewrite” jest wykonalna (rollout Phase 5)"
tags: [research, testing, quality-gates, ci, github-ruleset, post-edit-hook, eslint, smoke, pgtap, vitest]
status: complete
last_updated: 2026-11-19
last_updated_by: Claude (Opus 5.5)
---

# Research: bramki jakości (rollout Phase 5)

**Date**: 2026-11-19T09:55:54+01:00
**Researcher**: Claude (Opus 5.5)
**Git Commit**: 5617cc730b5ccf0928c8bef74ff2ff75ff3b91d0
**Branch**: testing-quality-gates (niezatwierdzona zmiana tylko w `context/foundation/test-plan.md` — §2/§3 po fazie 4)
**Repository**: carpooling

## Research Question

Z `change.md`: utrzymać podłogę — każda warstwa testów z faz 1–4 (Vitest,
pgTAP ze strażnikiem katalogowym RLS, smoke z krokami 404 dla każdego
endpointu z `rewrite("/404")`) ma czerwienić CI, a pętla agenta ma łapać
regresje w chwili edycji przez hook po edycji (§5). Kandydat z fazy 4
(§6.5): reguła lint/grep, że pliki `src/pages/api` wołające `rewrite(` czytają
`request.clone().formData()`. Każda bramka ma być udowodniona celowym
zepsuciem; unikać bramek dublujących sygnał CI lub przechodzących na
zepsutym pliku.

## Summary

1. **CI już czerwieni się dla każdej warstwy i blokuje merge.** Workflow ma
   dwa joby: `ci` (lint → `astro check` → `npm test` → build,
   `.github/workflows/ci.yml:10-26`) i `smoke` (`supabase test db` → build →
   smoke, `ci.yml:28-60`). Ruleset `protect-main` (enforcement `active`,
   `bypass_actors: []`) wymaga statusów `ci` i `smoke` ze
   `strict_required_status_checks_policy: true` (odczyt
   `gh api repos/pstawik/carpooling/rulesets/26843888`, 2026-11-19). Branch
   protection w starym API: brak (404) — reguły żyją tylko w rulesecie.
   Każde z narzędzi kończy się kodem ≠ 0 przy czerwieni: smoke
   `process.exit(failed ? 1 : 0)` (`scripts/smoke.mjs:781`), Vitest bez
   `passWithNoTests` (`vitest.config.ts:9-12`), `check-ui-literals`
   `process.exit(1)` (`scripts/check-ui-literals.mjs:63`). **Wniosek:** faza
   nie musi dodawać nowych jobów CI; luka „warstwa nie czerwieni CI” nie
   występuje na tej ścieżce — trzeba ją tylko *udowodnić* celowym zepsuciem
   (jeden czerwony przebieg na warstwę), nie budować.
2. **Hooka po edycji nie ma.** Brak `.claude/settings.json`;
   `.claude/settings.local.json` ma tylko `permissions`;
   `~/.claude/settings.json` nie zawiera `hooks` (grep, 2026-11-19). Jedyny
   lokalny hook to husky `pre-commit` → `npx lint-staged` (`.husky/pre-commit`),
   który robi tylko `eslint --fix` na `*.{ts,tsx,astro}` i `prettier --write` na
   `*.{json,css,md}` (`package.json` → `lint-staged`).
3. **Koszt kandydatów do hooka (pomiar lokalny, Windows, jeden plik):**
   `npx eslint <plik>` 37,5 s na zimno i 13,8 s przy drugim uruchomieniu
   (reguły type-checked z `projectService`, `eslint.config.js:16-24`);
   `npx prettier --check <plik>` 3,2 s; `npx vitest related <plik> --run`
   5,3 s. pgTAP i smoke wymagają lokalnego Supabase/serwera — nie nadają się
   do hooka po edycji.
4. **Reguła „clone() przed rewrite” jest wykonalna i dziś zielona.** Dokładnie
   12 plików w `src/pages/api` woła `rewrite(`; każdy z nich ma dokładnie jedno
   `request.clone().formData()` i żadnego `.json()` (pętla grep po
   `src/pages/api`, 2026-11-19; wzorzec np. `src/pages/api/groups/invite.ts:14-19`).
   Trzy pliki bez `rewrite` czytają ciało bez `clone()`:
   `src/pages/api/auth/signin.ts:16`, `src/pages/api/auth/signup.ts:16`,
   `src/pages/api/groups/join.ts:11` — dla nich to dziś bezpieczne, bo nie
   robią `rewrite`.
5. **Pokrycie 404 w smoke nie ma strażnika.** Ścieżka każdego z 12 endpointów
   występuje literalnie w `scripts/smoke.mjs` (1–6 wystąpień), ale wystąpienie
   ścieżki nie dowodzi kroku 404 — kroki 404 są nazwane „… renders 404” /
   „… gets 404” i część używa helperów (`addEventForm()`, `declareForm()`),
   więc mechaniczne powiązanie „endpoint ↔ krok 404” nie istnieje.

## Detailed Findings

### CI i ochrona gałęzi

- Job `ci`: `npm ci`, `astro sync`, `npm run lint` (= `eslint . && node
  scripts/check-ui-literals.mjs`, `package.json` scripts), `astro check`,
  `npm test`, `npm run build` (`ci.yml:18-26`).
- Job `smoke`: Supabase CLI przypięty do 2.122.0 (`ci.yml:34-37`),
  `supabase start` z wyłączonymi usługami, `supabase test db`
  (`ci.yml:46-47`), build, preview w tle + pętla `curl` do 60 s, potem
  `npm run smoke` (`ci.yml:54-58`). Pętla `curl` nie przerywa joba, gdy
  serwer nie wstanie — smoke wtedy pada na odrzuconym `fetch` (nieobsłużony
  wyjątek → kod ≠ 0), więc job i tak jest czerwony, tylko z mniej czytelnym
  komunikatem.
- Strażnik katalogowy RLS jest plikiem pgTAP (`supabase/tests/rls_catalog_guard.test.sql`,
  §6.3), więc czerwieni krok `supabase test db` jak każdy inny test.
- Brak filtrów `paths` w `on:` (`ci.yml:3-7`) — każdy PR do `main` uruchamia
  oba joby.
- Historia: `gh run list --status failure` zwraca 2 czerwone przebiegi, oba
  z 2026-11-06 na `main` (scaffold) — w inspected liście 10 ostatnich
  porażek nie ma przebiegu z czerwonym pgTAP/smoke/Vitest, więc „czerwień
  blokuje merge” nie jest jeszcze udowodniona empirycznie na GitHubie.

### Lokalne hooki i pętla agenta

- `.claude/` zawiera `prompts/`, `settings.local.json`, `skills/` — brak
  `settings.json` (ls, 2026-11-19).
- `eslint.config.js:83` ignoruje `.claude/`, więc skrypty hooka trzymane w
  `.claude/hooks/` nie będą lintowane przez `npm run lint`; skrypty w
  `scripts/` są lintowane z `disableTypeChecked` (`eslint.config.js:73-80`).
- Repo ma skill `/10x-configure-hook`, który mapuje bramki z §5 na momenty
  (edycja, koniec tury, commit, push, CI) i dowodzi każdego skryptu
  celowo zepsutym plikiem — naturalny wykonawca części „hook” tej fazy.

### Kandydat: reguła „clone() przed rewrite”

- Źródło wymagania: §6.4 checklist pkt 1 (`test-plan.md:255-257` — Astro
  rzuca `RewriteWithBodyUsed` (500), gdy `rewrite` następuje po
  przeczytaniu oryginalnego ciała) i §6.5 Faza 4 (żywy błąd 500 w
  `/api/admin/groups` i `/admins`, naprawiony).
- Dwa sposoby realizacji:
  - **ESLint `no-restricted-syntax`** w bloku `files: ["src/pages/api/**/*.ts"]`
    zakazujący wywołań `formData`/`json`/`text`/`arrayBuffer`, których
    obiekt nie jest wywołaniem `clone()`. AST, nie tekst — nie przejdzie na
    `request .formData()` z innym formatowaniem ani na `const r =
    context.request; r.formData()` *jeśli* selektor obejmie każdy taki
    member call. Wpada do istniejącego `npm run lint` (CI) i do lint-staged.
    Koszt: obejmie też `signin`/`signup`/`join` (3 pliki do przepisania na
    `clone()` albo wyjątek) — zmiana nieszkodliwa, ale zmiana kodu
    produkcyjnego.
  - **Skrypt grep** w stylu `check-ui-literals.mjs` (zero zależności):
    plik z `rewrite(` musi zawierać `.clone().formData()` / `.clone().json()`
    i nie może zawierać nieklonowanego odczytu. Łatwiejszy do wpięcia w
    hook (ms zamiast 14–37 s ESLinta), ale tekstowy — przejdzie na zepsutym
    pliku, gdy odczyt jest przez alias (`const req = context.request`), co
    jest dokładnie anty-wzorcem „bramka przechodząca na zepsutym pliku”.
- Oba warianty nie dublują CI: dziś żaden test poza smoke tego nie łapie, a
  smoke łapie tylko te endpointy, dla których istnieje krok 404 (pkt 5
  Summary).

### Pokrycie 404 w smoke

- 12 endpointów z `rewrite` → każda ścieżka obecna w `smoke.mjs`; kroki 404
  m.in. `smoke.mjs:274-297` (admin groups/admins, JSON), `:440-462`
  (children), `:474-554` (events), `:593` (generate), `:640-707`
  (attendance, driver). Strażnik „nowy endpoint z `rewrite` → krok 404 w
  smoke” wymagałby albo konwencji nazwy kroku zawierającej ścieżkę, albo
  rejestru endpointów w smoke — dziś żadnej z nich nie ma.

## Code References

- `.github/workflows/ci.yml:10-26` — job `ci` (lint, astro check, Vitest, build)
- `.github/workflows/ci.yml:28-60` — job `smoke` (pgTAP, build, preview, smoke)
- `scripts/smoke.mjs:745-781` — pętla kroków, `process.exit(failed ? 1 : 0)`
- `scripts/check-ui-literals.mjs:10-33,63` — lista `CLEANED_VIEWS`, exit 1
- `vitest.config.ts:9-12` — `include: src/**/*.test.ts`, bez `passWithNoTests`
- `eslint.config.js:16-24,73-80,83` — type-checked, blok `scripts/`, ignore `.claude/`
- `package.json` — `lint`, `test`, `smoke`, `lint-staged`
- `.husky/pre-commit` — `npx lint-staged`
- `src/pages/api/groups/invite.ts:14-19` — wzorzec `clone().formData()` w `try/catch`
- `src/pages/api/auth/signin.ts:16`, `src/pages/api/auth/signup.ts:16`, `src/pages/api/groups/join.ts:11` — odczyt bez `clone()` (bez `rewrite`)

## Architecture Insights

- Bramki CI są kompletne strukturalnie; wartość fazy to (a) dowód czerwieni
  per warstwa, (b) jedna nowa bramka statyczna (clone przed rewrite), (c)
  szybki hook po edycji, który nie powtarza pełnego CI.
- Hook po edycji musi mieścić się w kilku sekundach na Windows: pełny
  type-checked ESLint na plik (14–37 s) to za dużo na każdą edycję —
  kandydaci to `prettier --check`, szybki skrypt bramki statycznej i
  `vitest related`; ESLint lepiej w momencie „koniec tury” lub commit
  (lint-staged już go robi).
- Konwencja repo dla strażników bez zależności: skrypt `scripts/*.mjs`
  wpięty w `npm run lint` (`check-ui-literals.mjs`).

## Historical Context (from prior changes)

- `context/archive/2026-11-19-testing-api-error-paths/` — źródło kandydata
  na bramkę (§6.5 Faza 4: „reguła lint `clone()` przed `rewrite` w
  `src/pages/api/`”) — supported: 12/12 plików z `rewrite` ma dziś `clone()`.
- §5 test-plan (`test-plan.md:101`): „post-edit hook — recommended after §3
  Phase 5” — supported: hook nie istnieje.
- §4 test-plan: Vitest, pgTAP i smoke „uruchamiane w CI” — supported
  (`ci.yml:22,47,58`).

## Related Research

- `context/archive/2026-11-19-testing-api-error-paths/research.md`
- `context/archive/2026-11-18-testing-rls-isolation-matrix/` (strażnik katalogowy)

## Open Questions

1. **ESLint czy skrypt grep** dla reguły clone-before-rewrite (AST odporny na
   aliasy vs. ms w hooku) — i czy przepisać `signin`/`signup`/`join` na
   `clone()`, czy regułę zawęzić do plików z `rewrite(`.
2. **Jak udowodnić czerwień CI**: lokalne celowe zepsucie każdego narzędzia
   (exit ≠ 0) czy jednorazowy draft PR z zepsutym testem, żeby zobaczyć
   zablokowany merge na GitHubie.
3. **Skład hooka po edycji** (moment: po edycji vs. koniec tury) i czy
   strażnik „endpoint z `rewrite` → krok 404 w smoke” jest wart wprowadzenia
   konwencji w `smoke.mjs`, czy zostaje w checkliście §6.4.
