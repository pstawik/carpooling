# Gate proofs

## Reguła clone()

Reguła: `no-restricted-syntax` w `eslint.config.js` (blok `apiBodyConfig`, pliki `src/pages/api/**/*.ts`).
Wszystkie 15 endpointów przechodzi `npm run lint` (exit 0).

| Zepsucie | Komenda | Exit | Pierwsza linia komunikatu | Przywrócono |
| --- | --- | --- | --- | --- |
| (a) `invite.ts`: `context.request.clone().formData()` → `context.request.formData()` | `npx eslint src/pages/api/groups/invite.ts` | 1 | `16:18 error Read the request body via context.request.clone().<method>() — rewrite("/404") after reading the original body throws RewriteWithBodyUsed (500). See context/foundation/test-plan.md §6.4 no-restricted-syntax` | `git checkout -- src/pages/api/groups/invite.ts`, lint exit 0 |
| (b) `invite.ts`: alias `const req = context.request; form = await req.formData();` | `npx eslint src/pages/api/groups/invite.ts` | 1 | `16:47 error Read the request body via context.request.clone().<method>() — … no-restricted-syntax` | `git checkout -- src/pages/api/groups/invite.ts`, lint exit 0 |

## Czerwień CI — warstwy (lokalnie, 2026-11-19)

Zepsucie → komenda → exit. „Przywrócono” = `git checkout -- <plik>` (migracja: usunięta + `npx supabase db reset`), potem pełny przebieg na czystym drzewie.

| Warstwa | Zepsucie | Komenda | Exit | Przywrócono |
| --- | --- | --- | --- | --- |
| Vitest | `group-errors.test.ts:28` oczekuje `{ kind: "nope" }` | `npm test` | 1 (`AssertionError: expected { kind: 'forbidden' } to deeply equal { kind: 'nope' }`) | exit 0 |
| pgTAP | `engagement_stats_boundaries.test.sql:111` oczekiwane `…0099` | `npx supabase test db` | 1 (`Failed 1/5 subtests`) | exit 0 (`Result: PASS`) |
| Strażnik RLS | migracja `public.tmp_rls_break` bez RLS, `db reset` | `npx supabase test db` | 1 (`rls_catalog_guard`: testy 1–2 nazywają `public.tmp_rls_break`) | migracja usunięta, `db reset`, exit 0 |
| Smoke | `smoke.mjs:58` „home renders” oczekuje 201 | `npm run smoke` | 1 (`FAIL home renders -> 200`, `1 step(s) failed`) | exit 0 (`All smoke steps passed`) |
| check-ui-literals | `bg-purple-600` w `Topbar.astro` (z `CLEANED_VIEWS`) | `npm run lint` | 1 (`check-ui-literals: 1 hit(s)`) | exit 0 |
| astro check | `export const brokenGate: number = "x"` w `src/lib/utils.ts` | `npx astro check` | 1 (`ts(2322)`, 1 error) | exit 0 |
| Build | `import "./does-not-exist"` w `src/pages/index.astro` | `npm run build` | 1 (`UNRESOLVED_IMPORT`) | exit 0 |

## PR dowodowy (ruleset `protect-main`)

- PR: #72 (`testing-quality-gates-red-proof` od `origin/main`, jeden commit `5e0cda9`: odwrócona asercja Vitest + zepsuta asercja pgTAP).
- `headRefOid` = `5e0cda991af64ba42da111c21246ff519af43924` = lokalny HEAD gałęzi dowodu (sprawdzone przed `gh pr ready`).
- `statusCheckRollup`: `ci` = FAILURE, `smoke` = FAILURE.
- Po `gh pr ready`: `mergeStateStatus` = `BLOCKED` (jako draft było `BLOCKED` także, ale odczyt zapisany po `ready`), `mergeable` = MERGEABLE, czyli blokuje wyłącznie ruleset.
- Strona PR: przycisk merge zablokowany (potwierdził użytkownik).
- Stan końcowy: `CLOSED`, `mergedAt` = null; gałąź usunięta zdalnie i lokalnie, worktree usunięty.
- Uwaga: job `smoke` padł na pgTAP, więc krok `npm run smoke` w tym PR się nie wykonał; jego czerwień jest udowodniona lokalnie (tabela wyżej).
