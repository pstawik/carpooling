---
change_id: middleware-auth-error-logging
title: Log Supabase Auth errors in middleware instead of treating them as signed out
status: archived
created: 2026-11-19
updated: 2026-11-20
archived_at: 2026-11-20T05:50:58Z
---

## Notes

- GitHub issue: https://github.com/pstawik/carpooling/issues/79
- Source: `context/audits/observability/2026-11-19_groups.md`, finding P-1 (critical).
- Fix plan: `context/audits/observability/2026-11-19_groups-fix-plan.md`, step 1.
- `src/middleware.ts:20-23` ignores `error` from `supabase.auth.getUser()`. auth-js returns
  `{ user: null, error }` for `AuthRetryableFetchError` (network errors and 5xx), so an Auth outage
  redirects every protected route to `/auth/signin` as a plain 302 with no log.
- Open decision for the plan: 503 instead of the sign-in redirect on non-session-missing errors.
- Commit a7d97b6 (p1) also carries unrelated E2E work that was in the worktree at staging time:
  `tests/e2e/declaration-plan.spec.ts`, `tests/e2e/support/test-data.ts` and the
  `E2E_SUPABASE_SERVICE_ROLE_KEY` line in `.env.example`. Mention them in the PR description.
