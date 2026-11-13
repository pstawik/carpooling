---
change_id: group-admin-manages-events
title: Group admin manages events
status: impl_reviewed
created: 2026-11-12
updated: 2026-11-13
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **Group deletion drops finished events.** `events.group_id` is `on delete cascade` (`supabase/migrations/20261112150000_create_events.sql`), so deleting a group removes its started events too, although they are kept for the S-09 statistics. Nothing deletes groups today; a future "delete group" change, or S-09, must decide whether that is acceptable (impl-review F4).
- **S-07 / S-08 must cascade declarations.** The delete dialog in `src/components/groups/EventItem.tsx` tells the admin "Deklaracje tego terminu też zostaną usunięte" (FR-012). Every declaration table that references `public.events (id)` needs `on delete cascade`, plus a pgTAP assertion that deleting an event removes its declarations. Without it, the dialog is wrong and every delete fails with 23503, which the service maps to `unknown` (impl-review F5).
