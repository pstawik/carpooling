<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Logowanie błędów Supabase Auth w middleware

- **Plan**: context/changes/middleware-auth-error-logging/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-11-19
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Notes (no finding):
- Predicates come from `@supabase/supabase-js` rather than `@supabase/auth-js`, as the plan allows (auth-js is not a direct dependency).
- The 503 retry link uses `Astro.originPathname`, so the query string is dropped. In protected pages the query carries only one-shot `message`/`error`/`email` flags (`src/pages/groups/[id].astro:51-63`, `src/pages/admin/groups.astro:17-18`), so dropping it is harmless and keeps the e-mail out of the retried URL.
- `originPathname` reaches the page only for protected routes (or `/503` itself), so the link cannot become an open redirect.
- The automated gates were re-run during the review: lint (`check-ui-literals` 0 hits in 23 files), `astro check` 0 errors, `npm test` 179/179, build complete.

## Findings

### F1 — Phase 1 commit bundles unrelated E2E work

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: commit a7d97b6 (`tests/e2e/declaration-plan.spec.ts`, `tests/e2e/support/test-data.ts`, `.env.example`)
- **Detail**: a7d97b6 "Log Auth errors in middleware and return 503 on outage (p1)" also adds a new E2E spec for the declaration plan, a service-role test-data helper and the `E2E_SUPABASE_SERVICE_ROLE_KEY` key in `.env.example`. None of these is in the plan, and the commit body does not mention them. They were probably dirty in the worktree when Phase 1 was staged. History and a future PR for issue #79 will misattribute them.
- **Fix A ⭐ Recommended**: Keep history and disclose the E2E files in the PR description (and in change.md Notes)
  - Strength: The Progress rows cite SHAs a7d97b6 and fa9dcdb. Keeping history keeps them valid.
  - Tradeoff: The middleware commit stays mixed; reverting it would also revert the E2E spec.
  - Confidence: HIGH — the commits are local only (main is ahead of origin by 3), so nothing downstream depends on them yet.
  - Blind spot: Whether the E2E spec was meant to ship with its own reviewed change.
- **Fix B**: Split the history before pushing (soft reset to ea0c302 and recommit E2E, p1, p2 and epilogue separately)
  - Strength: Each commit has one purpose and can be reverted cleanly.
  - Tradeoff: Rewrites 3 commits, and every SHA in Progress has to be rewritten. That is error-prone and needs one more epilogue.
  - Confidence: MEDIUM — mechanical, but this environment does not support interactive rebase.
  - Blind spot: None significant; nothing has been pushed.
- **Decision**: FIXED (Fix A) — disclosed in change.md Notes; PR description still to mention it

### F2 — Change committed straight to main

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: main (ahead of origin/main by 3)
- **Detail**: Previous changes landed through PR branches (#77 `playwright-e2e-setup`, #78 `e2e-signed-in-session`), and CI runs on PRs. These three commits sit on local main.
- **Fix**: Create a branch at HEAD, reset local main to origin/main, push the branch and open a PR referencing #79.
- **Decision**: FIXED — moved to branch `middleware-auth-error-logging`, local main reset to origin/main, PR opened

### F3 — `Retry-After` on the 503 page not verified

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/503.astro:9
- **Detail**: The plan requires `Retry-After: 30` on the 503 page. Manual check 2.5 verified the 503 status only, not the header. Astro should merge `Astro.response.headers` into a page rendered via `next("/503")`, but no check observed it.
- **Fix**: During the next outage test, run `curl -sI -b <session cookie> http://localhost:4321/dashboard` and confirm `Retry-After: 30`.
- **Decision**: FIXED — verified by the user: `Retry-After: 30` present on /dashboard during an Auth outage
