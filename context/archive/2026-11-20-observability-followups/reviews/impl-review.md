<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Observability followups (P-2, G-8)

- **Plan**: context/changes/observability-followups/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-11-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- Planned files = changed source files (6): `error-log.ts`, `error-log.test.ts`, `supabase.ts`, `invites.ts`, `invites.test.ts`, `join/[token].astro`. No unplanned source changes; endpoints untouched, all 3 `joinRedirect` call sites (`api/groups/join.ts:31`, `api/auth/signin.ts:42`, `api/auth/signup.ts:48`) pick up the new redirect.
- P-2: `configMissingLogFields` emits names only (tested incl. no value leak); flag `configMissingLogged` set before `emitLog`; configured path unchanged. `ErrorLogFields` untouched. `missing` typed as the narrower literal union instead of `string[]` (compatible refinement).
- G-8: `error` → `?error=unknown`, `invalid` unchanged; page whitelists only `"unknown"`, Alert only in the valid-token + signed-in branch, 503/404 branches take precedence; tokens only (`variant="destructive"`, `text-left`, `break-words`).
- "Not doing" respected: no throw/503 in middleware, no second log in `[token].astro`, no palette cleanup / `CLEANED_VIEWS` edit, no E2E.
- Automated gates: `npm test` (210 passed), `npm run lint`, `npx astro check` (0 errors), `npm run build`, `npm run smoke` (all steps passed on built preview) — run in this session on the code now at HEAD (epilogue `7755451` touched only plan.md/change.md). Break-check on `joinRedirect` went red.
- Manual: 1.5–1.6 and 2.6–2.10 confirmed by the user during implementation.

## Findings

### F1 — 503 copy suggests retrying when config is missing

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/join/[token].astro:59-62
- **Detail**: Without Supabase config the page reuses the `lookupFailed` card ("Nie udało się sprawdzić zaproszenia — spróbuj ponownie za chwilę" + "Spróbuj ponownie"). Retrying cannot help until secrets are set. This is exactly what the plan specified, and the Layout banner already says Supabase is not configured, so the user is not misled about the cause.
- **Fix**: None required; optionally a later `/10x-ui` pass on this view could tailor the copy.
- **Decision**: FIXED — not-configured branch now says "Nie da się teraz sprawdzić zaproszenia: Supabase nie jest skonfigurowany." (via `groupErrorMessage("not_configured")`) and hides "Spróbuj ponownie"; status stays 503. Lint, astro check, build green.
