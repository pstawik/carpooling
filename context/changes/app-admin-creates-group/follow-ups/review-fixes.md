# Review follow-ups: app-admin-creates-group

Queued from `reviews/impl-review.md`. Pick these up in the next change that touches the same files (S-03).

## F9 — Test gaps for grants that a later change could loosen

- [ ] `supabase/tests/groups_rls.test.sql`: anon is denied `add_group_admin`, `admin_list_groups`, `is_app_admin`, `is_group_member`, `shares_group_with` (42501)
- [ ] `supabase/tests/groups_rls.test.sql`: a non-member app admin cannot read the profiles of a group's members
- [ ] `supabase/tests/groups_rls.test.sql`: an app admin cannot insert/update/delete `groups`, `group_members`, `app_admins` directly (42501)
- [ ] `scripts/smoke.mjs`: a regular signed-in user POSTing to `/api/admin/groups` gets 404
