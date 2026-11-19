-- Hardening of two grants found by the RLS isolation matrix (G1).
-- children: the table-wide INSERT grant let a parent set created_at on their
-- own child. group_child_stats counts only events with
-- starts_at >= c.created_at (20261116130000_create_engagement_stats.sql:90),
-- so a backdated or future created_at would shift the child's statistics
-- range. INSERT is now granted on the columns the client may set; created_at
-- always comes from its default. id stays in the grant so a client may still
-- pick the primary key.
-- profiles: anon has no policy, so RLS already returned zero rows; the SELECT
-- grant is revoked as well so profiles matches the other tables (grant and
-- RLS, two layers).

-- The table-wide INSERT grant must go first; a column grant alone is a no-op.
revoke insert on public.children from authenticated;
grant insert (id, group_id, parent_id, name) on public.children to authenticated;

revoke select on public.profiles from anon;
