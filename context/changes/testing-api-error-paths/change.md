---
change_id: testing-api-error-paths
title: Testy ścieżek błędów i walidacji wejścia w API
status: impl_reviewed
created: 2026-11-19
updated: 2026-11-19
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Ścieżki błędów i walidacja wejścia w API".
Risks covered: #5 (błąd backendu lub złośliwe/brzegowe wejście kończy się 500 albo pozornym sukcesem). Test types planned: unit + smoke.
Risk response intent: #5 — when a query/RPC errors or input is malicious/boundary (bad format, year out of range, empty body), the user gets an explicit error (4xx or redirect carrying an error), never a 500 or a success message; challenge "final 302 = success"; avoid mocking Supabase client internals and status-only assertions that ignore the redirect target and data state. Include in smoke F9: a regular signed-in user POST /api/admin/groups → 404 (archive/2026-11-10-app-admin-creates-group/follow-ups/review-fixes.md:10).
After creating the folder, follow the downstream continuation rule.
