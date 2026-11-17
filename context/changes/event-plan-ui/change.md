---
change_id: event-plan-ui
title: Event plan UI
status: implementing
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Notes

zaloz tez issue na github dotyczace tej zmiany

- **Issue:** https://github.com/pstawik/carpooling/issues/45

UI change started from `/10x-ui /groups/[id]/terminy/[eventId]` (design-system contract for one view).

- **View:** `/groups/[id]/terminy/[eventId]` — `src/pages/groups/[id]/terminy/[eventId].astro` only. Group page (done in `group-page-ui`) and stats (`/groups/[id]/statystyki`) are out of scope.
- **Token source:** `src/styles/global.css` (`.dark` values, published via `@theme inline`); shared components in `src/components/ui/` (shadcn, added via `npx shadcn@latest add <name>`) and `src/components/groups/group-page-classes.ts`.
- **Contract variant:** existing design system — tokens and components exist and `/groups/[id]` already reads them; this view never migrated (0 token classes, only `Button` imported and overridden). Extend it, reuse `group-page-classes.ts`; no new palette.
- **Pre-audit (2026-11-17):** hardcoded-value scan — 31 lines (90, 92–96, 98, 107, 108, 111, 116, 125, 136, 143, 148, 164, 175, 218, 222, 225, 258, 262, 265, 270, 285, 287, 293, 301, 303, 309, 322). View not in `CLEANED_VIEWS`. Draft charges: palette literals (card, purple primary, gradient h1, `text-blue-100/70`); hand-rolled alert ×3 + green success with no token; local `cardClass`/`inputClass` shadowing `Card`/`Input`/`group-page-classes.ts` (focus ring `purple-400` not `--ring`), back link duplicates `linkButtonClass`, badge without `ui/badge`; section order puts child declaration third on 360 px; locked = hidden buttons, load failure = one red line, no kitchen sink for this view.
