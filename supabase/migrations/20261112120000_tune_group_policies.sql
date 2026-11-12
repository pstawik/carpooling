-- Follow-up to 20261110120000_create_groups.sql (impl-review F5); no behaviour change.
-- 1. Wrap is_app_admin() in (select ...) so Postgres evaluates it once per query (initPlan)
--    instead of once per row — same style as (select auth.uid()) in create_profiles.sql.
-- 2. admin_list_groups() only reads, so mark it stable.

alter policy groups_select_member_or_app_admin
  on public.groups
  using (public.is_group_member(id) or (select public.is_app_admin()));

alter policy group_members_select_member_or_app_admin
  on public.group_members
  using (public.is_group_member(group_id) or (select public.is_app_admin()));

alter function public.admin_list_groups() stable;
