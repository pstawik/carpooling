---
change_id: dashboard-ui
title: Dashboard ui
status: impl_reviewed
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Notes

- **View (one):** `/dashboard` — `src/pages/dashboard.astro`
- **Token source:** `src/styles/global.css` (values in `.dark`, published via `@theme inline`); components in `src/components/ui/`, plus `src/components/Topbar.astro` and `src/components/groups/group-page-classes.ts`.
- **Contract variant:** existing design system — extend it, no second `shadcn init`, no second palette.
- **GitHub issue:** https://github.com/pstawik/carpooling/issues/52 (draft charges from the /10x-ui pre-audit).
- **Pre-audit:** 11 literal lines in the hardcoded-value scan; 0 role-token or `ui/` imports.
