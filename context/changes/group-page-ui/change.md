---
change_id: group-page-ui
title: Group page UI
status: implemented
created: 2026-11-16
updated: 2026-11-16
archived_at: null
---

## Notes

UI change started from `/10x-ui groups` (design-system contract for one view).

- **View:** `/groups/[id]` — `src/pages/groups/[id].astro` plus `src/components/groups/{ChildItem,EventItem,InvitePanel}.tsx`. Event plan (`/groups/[id]/terminy/[eventId]`) and stats (`/groups/[id]/statystyki`) are out of scope — separate changes.
- **Token source:** `src/styles/global.css` (`:root` / `.dark` values, published via `@theme inline`); shared components in `src/components/ui/` (shadcn, added via `npx shadcn@latest add <name>`).
- **Contract variant:** fresh starter with a dead token file — tokens exist but the view reads none of them (0 token classes; `.dark` is never applied although the UI is dark). Phase 1 makes the view read the existing tokens before any new values are chosen.
- **Pre-audit (2026-11-16):** hardcoded-value scan — `[id].astro` 40 lines, `EventItem.tsx` 5, `InvitePanel.tsx` 4, `ChildItem.tsx` 3. Draft charges: literal palette classes, inactive dark theme forcing `submitClass` overrides on every `<Button>`, input classes duplicated 6×, notice/alert blocks duplicated 6×, section order mirroring feature order rather than the parent's main flow on 360 px.
