# Join Group by Invite Link — Plan Brief

> Full plan: `context/changes/join-group-by-invite-link/plan.md`

## What & Why

Roadmap S-03 (FR-005, FR-006): a group admin generates one invite link per group and can regenerate it (the old link stops working at once); anyone with the link joins the group — signed-in users after one confirmation tap, new or signed-out users automatically right after sign-up or sign-in. Without this, groups created in S-02 have no way to get members.

## Starting Point

Groups, memberships and the RLS/RPC write pattern exist from S-02; `/groups/[id]` shows only name and admins. Auth endpoints always land on `/dashboard` and carry no return target. E-mail confirmation is off everywhere, so a sign-up yields a session immediately.

## Desired End State

The admin sees a "Link zaproszeniowy" panel on the group page (generate, copy, regenerate with confirmation). `/join/<token>` shows the group name and either "Dołącz do grupy" (signed in) or "Załóż konto" / "Mam konto — zaloguj się" (signed out); every path ends on the group page with "Dołączyłeś do grupy" or "Już jesteś członkiem tej grupy". A stale link shows a friendly "nieaktualny" page.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Join on open | Confirm with a "Dołącz do grupy" POST button | PRD says the user accepts the link; GET stays side-effect free. | Plan |
| Already a member | Redirect to group page with "Już jesteś członkiem tej grupy"; role unchanged | No dead end, an admin is never demoted. | Plan |
| Carrying the link through auth | `?invite=` + hidden form field, kept on error redirects | Stateless and explicit; no stale cookie can join someone later. | Plan |
| First link | Created on first admin request ("Wygeneruj link") | One RPC for create/regenerate; no change to `create_group`, no backfill. | Plan |
| Anonymous view | Shows the group name only | The parent knows what they sign up for; name is the only data exposed. | Plan |
| Token storage | Separate `group_invites` table, SELECT for group admins only | `groups` is readable by all members, so a column there would leak the token. | Plan |
| Token format | 24 random bytes, base64url (32 chars), zod-validated | Unguessable; malformed = unknown → same 404 page. | Plan |
| Copy UX | Read-only field + "Kopiuj" (clipboard API) | Works on mobile browsers; Web Share left out. | Plan |

## Scope

**In scope:** `group_invites` table + RLS, `is_group_admin`, RPCs `regenerate_group_invite`, `invite_group_name` (anon), `join_group_by_invite`; pgTAP; admin invite panel; `/join/[token]`; `POST /api/groups/invite`, `POST /api/groups/join`; `invite` threading through sign-up/sign-in; smoke; hosted `db push`; README.

**Out of scope:** expiry/usage limits, e-mail invites, member removal (FR-007), member list (FR-009), invite management by a non-member app admin, join on GET, general "return to" for protected routes, Web Share.

## Architecture / Approach

DB-first like S-02: all writes through `security definer` RPCs, RLS SELECT-only. Admin panel → `POST /api/groups/invite` → `regenerate_group_invite`. Link → `/join/<token>` (public, uses anon-callable `invite_group_name`) → signed in: `POST /api/groups/join`; signed out: `/auth/signup|signin?invite=` → auth endpoint → after success the same `joinByInvite` helper → `/groups/<id>?message=…`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Invite schema, RPCs and pgTAP | Table, helper, 3 RPCs, isolation + regeneration tests | First anon-executable function must expose only the name |
| 2. Admin invite panel | Generate / copy / regenerate on `/groups/[id]`, notices | Link URL must use the request origin per environment |
| 3. Join page for signed-in users | `/join/[token]` (3 states) + join endpoint | Already-member path must not touch the role |
| 4. Invite through sign-up/sign-in + smoke | `invite` survives both forms and error redirects; end-to-end smoke | Losing the token on an error redirect (roadmap S-03 risk) |
| 5. Hosted rollout and docs | `db push` before merge, README, prod read-only smoke | Merging before the hosted migration breaks production |

**Prerequisites:** S-02 merged (done); local Supabase running with the seed app admin; hosted project linked for Phase 5.
**Estimated effort:** ~2–3 sessions across 5 phases.

## Open Risks & Assumptions

- Assumes `Astro.url.origin` reflects the public host on Cloudflare Workers (verified manually in Phase 5).
- A forwarded link admits anyone until regenerated — accepted in PRD (FR-005); member removal stays parked.
- Group name is readable by anyone holding a valid link (accepted decision).
- Invite tokens appear in Worker request logs (URLs); same trust level as a forwarded link — regeneration is the remedy.
- Phase 5: hosted `db push` + README gate the merge; production smoke and a real join run right after the deploy.

## Success Criteria (Summary)

- A new parent clicks the link, creates an account and lands inside the group without retyping or re-opening the link.
- An existing parent joins with one tap (or after signing in); repeating the link is harmless.
- After regeneration the old link no longer admits anyone, and non-admins can never read the token.
