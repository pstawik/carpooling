---
change_id: group-stats-ui
title: Move the group stats view onto design tokens and shared components
status: archived
created: 2026-11-17
updated: 2026-11-17
archived_at: 2026-11-17T08:48:53Z
---

## Notes

zaloz tez issue w github dla tej zmiany

- **GitHub issue:** https://github.com/pstawik/carpooling/issues/49

- **View (one):** `/groups/[id]/statystyki` — `src/pages/groups/[id]/statystyki.astro`
- **Token source:** existing design system — tokens in `src/styles/global.css` (`.dark`, always on), components in `src/components/ui/`, shared class constants in `src/components/groups/group-page-classes.ts`. Extend it; no second palette, no `shadcn init`.
- **Pre-audit (/10x-ui, 2026-11-17):** 0 token classes and 0 `ui/` imports in the view (only `bg-cosmic`); 18 literal hits on 11 lines (40, 41, 50, 57, 65, 73, 85, 94, 101, 103, 118). The view is not in `CLEANED_VIEWS` of `scripts/check-ui-literals.mjs` and has no kitchen sink.
- **Reference pattern:** `src/pages/groups/[id]/terminy/[eventId].astro` (cleaned in event-plan-ui).
