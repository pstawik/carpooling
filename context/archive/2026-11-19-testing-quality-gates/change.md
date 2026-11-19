---
change_id: testing-quality-gates
title: Quality gates — keep the test floor in CI and a post-edit hook
status: archived
created: 2026-11-19
updated: 2026-11-19
archived_at: 2026-11-19T10:07:42Z
---

## Notes

Open a change folder for rollout Phase 5 of context/foundation/test-plan.md: "Bramki jakości".
Risks covered: cross-cutting (floor for risks #1–#6). Test types planned: gates, post-edit hook.
Risk response intent: keep the floor from dropping — every test layer shipped in Phases 1–4 (Vitest, pgTAP incl. the RLS catalog guard, smoke incl. 404 steps for every rewrite("/404") endpoint) fails CI when it goes red, and the agent loop catches regressions at edit time via a post-edit hook (§5: "recommended after §3 Phase 5"); candidate gate from Phase 4 (§6.5): a lint/grep rule that src/pages/api files calling rewrite( read request.clone().formData(). Prove each gate with a deliberate break; avoid gates that duplicate a signal CI already gives or that pass on a broken file.
