---
change_id: middleware-auth-error-logging
title: Log Supabase Auth errors in middleware instead of treating them as signed out
status: implemented
created: 2026-11-19
updated: 2026-11-19
archived_at: null
---

## Notes

- GitHub issue: https://github.com/pstawik/carpooling/issues/79
- Source: `context/audits/observability/2026-11-19_groups.md`, finding P-1 (critical).
- Fix plan: `context/audits/observability/2026-11-19_groups-fix-plan.md`, step 1.
- `src/middleware.ts:20-23` ignores `error` from `supabase.auth.getUser()`. auth-js returns
  `{ user: null, error }` for `AuthRetryableFetchError` (network errors and 5xx), so an Auth outage
  redirects every protected route to `/auth/signin` as a plain 302 with no log.
- Open decision for the plan: 503 instead of the sign-in redirect on non-session-missing errors.
