# Parent Adds Child — Plan Brief

> Full plan: `context/changes/parent-adds-child/plan.md`

## What & Why

Roadmap S-04 (FR-010): a group member can add, rename and delete their own children (first name or nick), each assigned to one group. The event plan, the seat balance and the statistics (S-07 to S-09) all count children, so nothing downstream works without them. The roadmap flags children's data as the most sensitive, so isolation must cover both the group and the child's owner.

## Starting Point

Groups, memberships and invite links exist (S-02, S-03). `/groups/[id]` shows the group name, its admins and the admin-only invite panel. There is no `children` table. Existing writes go through `security definer` RPCs, and the helpers `is_group_member` / `is_group_admin` are available for policies.

## Desired End State

Every member sees a "Dzieci" card on the group page. "Twoje dzieci" has inline "Edytuj" and "Usuń" (with confirmation) for each own child. "Pozostałe dzieci w grupie" shows other parents' children with the parent's nick, read-only. A "Dodaj dziecko" form sits below. The database refuses any cross-group read and any write to a child the caller does not own.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Visibility | All group members read all children of the group | Matches FR-016, so S-07 needs no policy change. |
| Write path | Per-operation RLS policies (owner + member); UPDATE granted on `name` only | Plain CRUD, enforced in the DB as AGENTS.md requires; group and owner can't be changed. |
| Delete | Hard delete with a confirmation dialog | Simplest and minimises data; S-07 decides its FK behaviour. |
| Duplicate names | Unique per parent per group (case/whitespace-insensitive); other parents may reuse a name | Blocks double-adds while still allowing real namesakes. |
| UI placement | "Dzieci" card on `/groups/[id]`, form POSTs + small React island | The child is scoped to a group; reuses the redirect and notice pattern. |
| Detecting a forbidden edit | update/delete with `.select("id")`; 0 rows → `child_not_found` | RLS hides foreign rows instead of raising an error. |

## Scope

**In scope:** `children` table + 4 RLS policies + unique index; pgTAP; `Child` type, zod schemas, service; `POST /api/groups/children` (add), `/children/update` and `/children/delete`; error and notice codes; "Dzieci" card + `ChildItem` island; smoke steps; hosted `db push`; README.

**Out of scope:** moving a child between groups, co-parent shared ownership, soft delete, group-wide name uniqueness, cap on children per parent, admin managing others' children, extra child fields, attendance (S-07), member removal (FR-007).

## Architecture / Approach

The migration comes first. The DB enforces everything: SELECT for `is_group_member(group_id)`; INSERT, UPDATE and DELETE for `parent_id = auth.uid() and is_group_member(group_id)`; a column-level UPDATE grant on `name`. The group page calls `listGroupChildren` (embedding `profiles(nick)`). Forms POST to the three endpoints, which validate with zod, call the service and redirect to `/groups/<id>?message|error=<code>#dzieci`. A 42501 is answered with a 404.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Children schema, RLS and pgTAP | Table, index, privileges, 4 policies, isolation/ownership tests | Supabase's default table-wide UPDATE grant must be revoked, or the column grant does nothing |
| 2. Children section on the group page | Service, 3 endpoints, messages, card + island, smoke | Foreign edits fail silently (0 rows) unless detected |
| 3. Hosted rollout and docs | `db push` before merge, README, prod smoke | Merging before the hosted migration breaks the group page in production |

**Prerequisites:** S-02 merged (done); local Supabase running with the seed; hosted project linked for Phase 3.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Children's names become visible to every group member from this slice on (accepted; FR-016 requires it anyway).
- Once S-07 exists, a hard delete will remove that child's past attendance from the statistics (accepted for MVP).
- Two parents of the same child create two separate rows. Shared ownership stays out of the MVP.

## Success Criteria (Summary)

- A parent adds, renames and deletes their child from a phone at 360 px, with a clear notice after each action.
- Other members of the group see the child with the parent's nick; nobody outside the group sees it, even by bypassing the UI.
- A child named twice by the same parent is rejected, while namesakes from different parents are allowed.
