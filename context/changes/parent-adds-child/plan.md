# Parent Adds Child Implementation Plan

## Overview

Roadmap S-04 (FR-010): a parent who is a member of a group can add, rename and delete their own children (first name or nick), each assigned to exactly one group. Every member of the group sees all of its children, with the parent's nick shown next to each child. S-07 (attendance) and S-08 (seat balance) will build on this table.

## Current State Analysis

- There is no `children` table and no children UI. The group page `/groups/[id]` shows the group name, its admins and (for admins only) the invite panel (`src/pages/groups/[id].astro`).
- DB pattern from S-02/S-03: RLS is enabled on every table, SELECT policies call the `security definer` helpers `public.is_group_member(uuid)` / `public.is_group_admin(uuid)`, and writes go through RPCs (`supabase/migrations/20261110120000_create_groups.sql`, `20261112130000_create_group_invites.sql`). This slice deliberately uses **per-operation RLS policies** for writes instead (decision below); both styles satisfy the AGENTS.md hard rule.
- `group_members.user_id` references `profiles(id)` so PostgREST can embed `profiles(first_name, nick)` (`20261110120000_create_groups.sql:26-36`). `children.parent_id` follows the same rule for the same reason.
- Endpoint pattern: form POST → zod → Supabase → redirect to `/groups/<id>?message=<code>` or `?error=<code>`. A permission error (42501) is answered with a 404 rewrite (`src/pages/api/groups/invite.ts`). Codes map to Polish text in `src/lib/services/group-errors.ts`.
- pgTAP tests live in `supabase/tests/*_rls.test.sql` and CI runs them with `supabase test db` (`.github/workflows/ci.yml`). Smoke (`scripts/smoke.mjs`) already creates a group, an invite and a joined member.

## Desired End State

On `/groups/<id>`, every member sees a "Dzieci" card that contains:
- "Twoje dzieci": the member's own children, each with "Edytuj" (inline rename) and "Usuń" (asks for confirmation first);
- "Pozostałe dzieci w grupie": other parents' children, each with the parent's nick, read-only;
- an "Dodaj dziecko" form with a name field (1–40 characters).

Each action redirects back with a notice ("Dziecko dodane" / "Zmieniono imię dziecka" / "Dziecko usunięte") or an error ("Podaj imię lub nick dziecka (najwyżej 40 znaków)", "Masz już dziecko o tym imieniu w tej grupie", "Nie znaleziono dziecka"). The database rejects any read of another group's children, and any insert, update or delete of a child the caller does not own, even when the app screens are bypassed. Verify with pgTAP, smoke and a manual pass at a 360 px viewport.

### Key Discoveries:

- Helpers to reuse in the policies: `public.is_group_member` (`supabase/migrations/20261110120000_create_groups.sql:75-87`).
- Pattern for the `profiles` FK that makes the PostgREST embed work: `20261110120000_create_groups.sql:26-36`.
- Pattern for endpoint and 404-on-forbidden: `src/pages/api/groups/invite.ts`.
- Error and notice registry plus `groupRpcFailure`: `src/lib/services/group-errors.ts:8-43`.
- Group page loader returns `null` for non-members: `src/lib/services/groups.ts` (`getGroupWithAdmins`).
- Pattern for the React island (confirm dialog, `cn()`, 44 px buttons): `src/components/groups/InvitePanel.tsx`.

## What We're NOT Doing

- Moving a child to another group. `group_id` and `parent_id` cannot be changed; to move a child, delete it and add it again.
- Shared ownership between two parents of the same child. Each parent who adds the child creates a separate row.
- Soft delete or archiving. Delete removes the row. S-07 decides what happens to attendance rows when their child is deleted.
- Uniqueness of names across the whole group. Two parents may each have an "Ola", told apart by the parent's nick.
- A cap on the number of children per parent.
- Letting a non-member app admin or a group admin manage other parents' children.
- Any other child data (age, photo, notes). The PRD's data-minimisation non-goal applies.
- Attendance declarations (S-07) and member removal (FR-007). A removed member's children stay in the group, and nobody can delete them through the app, because the update and delete policies require membership. Whoever implements FR-007 or performs a manual SQL removal must also delete that member's children in the group.

## Implementation Approach

DB first. One additive migration creates the table and enables RLS with one policy per operation (SELECT for members; INSERT, UPDATE and DELETE for the owner who is still a member). UPDATE is granted on the `name` column only, so ownership and group are immutable at the privilege level, not just in a policy. A unique index enforces "one name per parent per group". The app layer is a thin service plus three form endpoints that reuse the redirect and notice pattern. The group page gains one card with a small React island per own child, for inline edit and delete confirmation.

## Critical Implementation Details

- **Detecting a write that affected no rows**: RLS turns an update or delete of someone else's child into "0 rows", not an error. The service must request `.select("id")` on update and delete, and treat an empty result as `child_not_found`. A rejected INSERT, by contrast, raises 42501. That is answered with a 404 like other forbidden actions.
- **Column privilege**: Supabase grants table-wide UPDATE to `authenticated` by default. The migration must `revoke update` on the table first, then `grant update (name)`. Granting the column alone is a no-op while the table-wide grant still exists.

## Phase 1: Children schema, RLS and pgTAP

### Overview

One migration with the table, index, privileges and four policies, plus a pgTAP file proving isolation by group and by owner. No app code.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261112140000_create_children.sql` (new)

**Intent**: Store each parent's children per group. Any member of the group can read them. Only the owning parent, while still a member, can write.

**Contract**:
- Table `public.children (id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade, parent_id uuid not null references public.profiles(id) on delete cascade, name text not null constraint children_name_length check (char_length(trim(name)) between 1 and 40), created_at timestamptz not null default now())`, with a table comment.
- `create unique index children_parent_name_unique on public.children (group_id, parent_id, lower(trim(name)))`. This also serves lookups by `group_id`.
- `create index children_parent_id_idx on public.children (parent_id)`.
- RLS enabled. `revoke all on public.children from anon`. `revoke truncate, update on public.children from authenticated`. `grant update (name) on public.children to authenticated`.
- Policies, all `to authenticated`:
  - `children_select_group_member`: `for select using (public.is_group_member(group_id))`.
  - `children_insert_own`: `for insert with check (parent_id = (select auth.uid()) and public.is_group_member(group_id))`.
  - `children_update_own`: `for update using (…same predicate…) with check (…same predicate…)`.
  - `children_delete_own`: `for delete using (…same predicate…)`.

#### 2. pgTAP test

**File**: `supabase/tests/children_rls.test.sql` (new)

**Intent**: Prove the isolation guarantees the UI relies on. The roadmap names this the riskiest point of the slice.

**Contract**: Fixtures as in `group_invites_rls.test.sql`: A (member of G1), B (member of G1), C (member of G2), D (in no group). Asserts at least:
- RLS is enabled and the policy list is exactly the four policies.
- anon has no table privileges.
- authenticated has no TRUNCATE privilege, no table-level UPDATE, and has column UPDATE on `name` but not on `group_id` or `parent_id`.
- A inserts a child in G1.
- A cannot insert into G2, and cannot insert into G1 with `parent_id = B`. Both fail with 42501.
- D cannot insert anywhere.
- A and B see A's child. C and D see 0 rows.
- B's update and delete of A's child affect 0 rows, and the row is unchanged.
- A renames their own child. An attempt by A to update `group_id` or `parent_id` fails with a permission error.
- A's second child with the same name (case and whitespace differences only) fails with 23505.
- B may add a child with the same name in G1.
- A deletes their own child.
- Deleting G1 cascades to its children.

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local DB: `npx supabase db reset`
- All pgTAP tests pass, including the new file: `npx supabase test db`

#### Manual Verification:

- In local Studio, `children` shows RLS enabled with exactly the four policies (select/insert/update/delete) and no privileges for `anon`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Children section on the group page

### Overview

Service, validation, three endpoints, error and notice codes, the "Dzieci" card with its React island, and smoke steps.

### Changes Required:

#### 1. Types

**File**: `src/types.ts`

**Intent**: Shared entity type for the new table.

**Contract**: `interface Child { id: string; group_id: string; parent_id: string; name: string; created_at: string }`.

#### 2. Validation

**File**: `src/lib/validation/children.ts` (new)

**Intent**: Validate form input before any DB call.

**Contract**: `childNameSchema` (string, trimmed, 1–40 chars); `addChildSchema { group_id: uuid, name }`; `updateChildSchema { group_id: uuid, child_id: uuid, name }`; `deleteChildSchema { group_id: uuid, child_id: uuid }`.

#### 3. Service

**File**: `src/lib/services/children.ts` (new)

**Intent**: Keep Supabase queries out of pages and endpoints.

**Contract**:
- `listGroupChildren(supabase, groupId) → { id, name, parentId, parentNick }[]`, built from `children` with the embed `profiles(nick)`.
- `addChild(supabase, { groupId, parentId, name })`, `renameChild(supabase, { groupId, childId, name })`, `deleteChild(supabase, { groupId, childId })`.
- Each write returns `{ ok: true }` or `{ ok: false, failure: "forbidden" | "duplicate_child" | "child_not_found" | "unknown" }`, using this mapping:

  | DB outcome | `failure` |
  | --- | --- |
  | 42501 | `forbidden` |
  | 23505 | `duplicate_child` |
  | update/delete returned 0 rows (via `.select("id")`) | `child_not_found` |
  | any other error | `unknown` |

- Rename and delete filter on both `id` and `group_id`.

#### 4. Error and notice codes

**File**: `src/lib/services/group-errors.ts`

**Intent**: Polish messages for the new outcomes, reusing the existing `?error=` / `?message=` rendering.

**Contract**:

| Kind | Code | Polish text |
| --- | --- | --- |
| error | `invalid_child_name` | "Podaj imię lub nick dziecka (najwyżej 40 znaków)" |
| error | `duplicate_child` | "Masz już dziecko o tym imieniu w tej grupie" |
| error | `child_not_found` | "Nie znaleziono dziecka" |
| notice | `child_added` | "Dziecko dodane" |
| notice | `child_updated` | "Zmieniono imię dziecka" |
| notice | `child_deleted` | "Dziecko usunięte" |

#### 5. Endpoints

**File**: `src/pages/api/groups/children.ts`, `src/pages/api/groups/children/update.ts`, `src/pages/api/groups/children/delete.ts` (new)

**Intent**: Form POST handlers for add, rename and delete, following `src/pages/api/groups/invite.ts`.

**Contract**:
- Each handler exports `POST`.
- Not signed in → redirect to `/auth/signin`. Non-form body or invalid `group_id` / `child_id` → `rewrite("/404")`.
- Invalid name → redirect to `/groups/<id>?error=invalid_child_name#dzieci`.
- `forbidden` → `rewrite("/404")`. Other failures → redirect with `?error=<failure>#dzieci`; `unknown` is also logged with `console.error`.
- Success → redirect to `/groups/<id>?message=child_added|child_updated|child_deleted#dzieci`.
- `parent_id` always comes from `context.locals.user.id`, never from the form.

#### 6. Group page and island

**File**: `src/pages/groups/[id].astro`, `src/components/groups/ChildItem.tsx` (new)

**Intent**: Show and manage children where the group lives.

**Contract**:
- After `getGroupWithAdmins`, call `listGroupChildren`. If that fails, log it and show "Nie udało się wczytać dzieci." inside the card; the rest of the page still renders.
- The `child_*` notices and the `invalid_child_name` / `duplicate_child` / `child_not_found` errors render inside the Dzieci card, just above the add form, with the same `role="status"` / `role="alert"` styles. The top-of-page banner skips these codes. The redirect lands on `#dzieci`, so the feedback has to be visible there on a 360 px screen.
- `<section id="dzieci">` card titled "Dzieci":
  - "Twoje dzieci": own children sorted by name with the `pl` locale, each rendered as `<ChildItem client:load>`. When there are none: "Nie dodałeś jeszcze dziecka."
  - "Pozostałe dzieci w grupie": other parents' children, shown as "name (parent nick)" and sorted by name. Omitted when empty.
  - A plain HTML form posting to `/api/groups/children` with a `name` input (maxlength 40, required) and a "Dodaj dziecko" button.
- `ChildItem`, read mode: name plus "Edytuj" and "Usuń" buttons.
  - "Edytuj" switches to an inline form posting to `/children/update`, with the input prefilled and "Zapisz" / "Anuluj" buttons.
  - "Usuń" is a form posting to `/children/delete`, guarded by `window.confirm("Usunąć dziecko <name>?")`.
- All buttons are at least 44 px tall. No horizontal scroll at 360 px. Long names wrap (`break-words`). Classes are merged with `cn()`.

#### 7. Smoke steps

**File**: `scripts/smoke.mjs`

**Intent**: Prove the HTTP flow end to end in CI.

**Contract**: New write-mode steps in two places, using sessions that already exist in the script. Child names are unique per run (`Dziecko-<random>`), so `contains` / `notContains` can't match other page text.

While the stranger (a member after "stranger signs in with invite and joins") is signed in, insert before the "stranger signs out" step at `smoke.mjs:202`:
1. Add child A → 302 to `?message=child_added`.
2. Add the same name again → `?error=duplicate_child`.
3. Empty name → `?error=invalid_child_name`.
4. Group page contains A's name. Capture A's `child_id` from the HTML, the same way the invite token is captured.
5. Rename A → `?message=child_updated`. The page contains the new name.
6. Add child B, then delete B → `?message=child_deleted`. The page no longer contains B's name.
7. Add with a malformed `group_id` → 404.

After "designated admin signs in again", run these two steps, which check that one parent can't touch another parent's child:
8. Group page contains A's renamed name (shown to another member).
9. POST `/api/groups/children/delete` with A's `child_id` → `?error=child_not_found`. A stays in the group.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- Smoke passes, including the new children steps: `npm run smoke`

#### Manual Verification:

- At a 360 px viewport, a parent adds, renames and deletes a child without zooming or horizontal scroll, and sees each notice
- A second member of the same group sees that child with the parent's nick but no "Edytuj" / "Usuń" buttons
- A user from another group gets 404 on the group page and sees no children; a duplicate name shows "Masz już dziecko o tym imieniu w tej grupie"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Hosted rollout and docs

### Overview

Apply the migration to the hosted project before merging, and document the feature.

### Changes Required:

#### 1. Hosted database

**File**: hosted Supabase project (no repo file)

**Intent**: Production must have the table before Workers Builds deploys `main`.

**Contract**: Run `npx supabase db push` (the seed is never pushed). `npx supabase migration list` then shows Local and Remote in sync.

#### 2. README

**File**: `README.md`

**Intent**: Document the children flow and the new routes.

**Contract**:
- The Routes section gains `POST /api/groups/children`, `POST /api/groups/children/update` and `POST /api/groups/children/delete`.
- A short "Children" subsection explains:
  - every member sees all children of the group;
  - only the parent can rename or delete their own child;
  - a name is unique per parent per group;
  - delete is permanent.
- The Smoke test section mentions the children steps.

### Success Criteria:

#### Automated Verification:

- Migrations are in sync with hosted: `npx supabase migration list`
- Production read-only smoke passes after deploy: `SMOKE_READONLY=1 BASE_URL=<production url> npm run smoke`

#### Manual Verification:

- In production, the author adds a real child to their group and a second member sees it
- README describes the children flow and new routes

**Implementation Note**: 3.1 (hosted migrations in sync) and 3.4 (README) gate the merge to `main`, because Workers Builds deploys on merge and the hosted DB must be ready first. 3.2 (production read-only smoke) and 3.3 (real child in production) are checks run right after the deploy. If either fails, fix forward or revert the merge.

---

## Testing Strategy

### Database tests (pgTAP):

- Reads: members of the group can read children; other groups' members and strangers cannot.
- Writes: only the owner who is a member can insert, update or delete. A foreign update or delete affects 0 rows. A foreign insert gets 42501.
- Immutability: `group_id` and `parent_id` cannot be updated (column privilege).
- Uniqueness: case- and whitespace-insensitive per parent per group; different parents may share a name.
- Cascade: deleting a group removes its children.

### Integration (smoke over HTTP):

- Add, duplicate, invalid name, rename, delete, malformed group id (as the stranger, who is a member).
- Another member sees the child, and their delete attempt gets `child_not_found` (as the group admin).

### Manual Testing Steps:

1. As a member on a 360 px viewport, add "Ola", rename it to "Ola K.", then delete it (confirm the dialog).
2. Add "Ola" twice → duplicate error.
3. As a second member of the same group, see the first parent's child with their nick, read-only.
4. As a member of another group, open the first group's URL → 404.

## Performance Considerations

Negligible. The group page adds one indexed select by `group_id` (the leading column of the unique index) with a `profiles` embed. Data volume is tens of children.

## Migration Notes

The migration only adds things and needs no backfill. Rollback is `drop table public.children`; no existing data changes.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04); PRD FR-010, Guardrails, Access Control
- Prior plan: `context/archive/2026-11-12-join-group-by-invite-link/plan.md`
- Helpers: `supabase/migrations/20261110120000_create_groups.sql:75-87`
- Profiles FK for embeds: `supabase/migrations/20261110120000_create_groups.sql:26-36`
- Endpoint pattern: `src/pages/api/groups/invite.ts`
- Error mapping: `src/lib/services/group-errors.ts`
- pgTAP fixtures: `supabase/tests/group_invites_rls.test.sql`
- Smoke harness: `scripts/smoke.mjs:75-90`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Children schema, RLS and pgTAP

#### Automated

- [x] 1.1 Migration applies on a clean local DB: `npx supabase db reset`
- [x] 1.2 All pgTAP tests pass, including the new file: `npx supabase test db`

#### Manual

- [x] 1.3 In local Studio, `children` shows RLS enabled with exactly the four policies (select/insert/update/delete) and no privileges for `anon`

### Phase 2: Children section on the group page

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Type check passes: `npx astro check`
- [ ] 2.3 Build passes: `npm run build`
- [ ] 2.4 Smoke passes, including the new children steps: `npm run smoke`

#### Manual

- [ ] 2.5 At a 360 px viewport, a parent adds, renames and deletes a child without zooming or horizontal scroll, and sees each notice
- [ ] 2.6 A second member of the same group sees that child with the parent's nick but no "Edytuj" / "Usuń" buttons
- [ ] 2.7 A user from another group gets 404 on the group page and sees no children; a duplicate name shows "Masz już dziecko o tym imieniu w tej grupie"

### Phase 3: Hosted rollout and docs

#### Automated

- [ ] 3.1 Migrations are in sync with hosted: `npx supabase migration list`
- [ ] 3.2 Production read-only smoke passes after deploy: `SMOKE_READONLY=1 BASE_URL=<production url> npm run smoke`

#### Manual

- [ ] 3.3 In production, the author adds a real child to their group and a second member sees it
- [ ] 3.4 README describes the children flow and new routes
