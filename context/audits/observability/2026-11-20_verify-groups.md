---
type: observability-audit
date: 2026-11-20 11:09
mode: verify
commit: d4f0e1a
branch: main
dirty_tree: false
areas: [groups]
area_source: arguments
runtime_proof: not-run
error_tracker: none (Cloudflare Workers Logs via structured console objects from emitLog)
previous_report: context/audits/observability/2026-11-19_groups.md
findings: { critical: 0, high: 0, medium: 0, low: 1 }
---

# Observability audit (verify): groups (2026-11-20)

Re-checks every finding of `2026-11-19_groups.md` (audited at `ea0c302`) against `main` at
`d4f0e1a`, after the five steps of `2026-11-19_groups-fix-plan.md` landed:
`middleware-auth-error-logging` (#80, #81), `log-unexpected-refusals` (#82, #83),
`service-error-cause` (#85), `structured-error-logs` (#88) and `observability-followups` (#93).

## 1. TL;DR

- **All 12 findings are closed or deliberately changed:** 10 `fixed`, 2 `changed`, 0 `still open`.
- **An Auth outage no longer looks like a sign-out.** It logs `auth_failed` with `kind: "outage"` and
  returns 503 on protected pages and the API (`src/middleware.ts:39-53`).
- **Silent 404 refusals now leave a log entry.** It is `unexpected_refusal` at `warn`, or at `error`
  where the refusal "should not happen". The user still sees the 404, so group existence still
  doesn't leak (13 call sites).
- **Every server log line is one structured object** with a stable `event` and the entity UUIDs.
  The `code` and `message` come from the original Supabase error, kept as `cause`. That makes one
  Workers Logs query or alert per `event` possible.
- **What's left is outside the code:** no alert exists yet on any `event`, and no runtime probe
  harness was ever built. The one remaining code-level item is low: stacks are deliberately not
  logged (see V-1).

## 2. Capture model (changes since 2026-11-19)

| Piece | Now | Where |
|---|---|---|
| Error tracker | Still none | in repo |
| Log sink | `emitLog(level, fields)` is the only `console[level]` call in `src/`. Each line is one object, so Workers Logs indexes the fields. | `src/lib/error-log.ts:68-71`; sweep: 0 direct `console.*` in non-test `src/` |
| Event taxonomy | `write_failed`, `section_degraded`, `read_failed`, `unexpected_refusal`, `auth_failed`, `config_missing` | `src/lib/error-log.ts:1-2` |
| Field whitelist | `event`, `op`, `name`, plus `code`/`message` from `cause` when present, plus `userId`/`groupId`/`eventId`/`childId`/`failure`. Never `details`, `hint` or `stack`. | `src/lib/error-log.ts:42-62` |
| Service errors | `serviceError(op, error)` keeps the Supabase error as `cause` and puts the code in the message | `src/lib/service-error.ts:6-9`; 11 call sites |
| Middleware | Classifies `getUser()` errors as `signed_out`, `session_rejected` (warn) or `outage` (error + 503) | `src/middleware.ts:39-53`, `src/lib/auth-error.ts:12-17` |
| Missing config | One `config_missing` per isolate with variable names only | `src/lib/supabase.ts:7-16` |

**Assumptions (outside the repo, not findings):**
- Workers Logs collection is on (`wrangler.jsonc`). Confirmed in the previous run.
- A Workers Logs filter on `event` returns the fields separately. **Confirmed** for
  `unexpected_refusal` after the #88 deploy (structured-error-logs plan step 3.8).
- **No alert rule exists yet** on any `event` value. Confirmed by the user earlier and not changed
  since. Until one exists, every finding below marked `fixed` is searchable, but nobody is paged.

## 3. What reaches the logs (static-only, runtime proof not run)

| Failure shape | Response | Workers Logs | Before → now |
|---|---|---|---|
| Supabase Auth unreachable or 5xx in middleware | 503 (`/503` page, or plain 503 on `/api/*`) | `{event: auth_failed, kind: outage, name, status, code, message, path}` | missed → **good** |
| RLS policy or grant regression → 42501 on a write | 404 page | `{event: unexpected_refusal, op, code, message, ids}`; `error` where unexpected | missed → **good** |
| RLS hides the member's own `group_members` row | 404 | `unexpected_refusal` at `error` from `getGroupWithAdmins` | missed → **good** |
| Unexpected PostgREST error on a write | 302 → `?error=unknown` | `{event: write_failed, op, code, message, ids}` | poor → **good (by event, not status)** |
| Read error in a degraded section | 200 with an alert | `{event: section_degraded, op, code, message, ids}` | poor → **good** |
| `SUPABASE_URL/KEY` missing | unchanged (banner, signin redirect); `/join/<token>` 503 | one `{event: config_missing, missing: [...]}` per isolate | missed → **good** |

## 4. Systemic root causes: status

1. **Middleware treated an auth error as "signed out"** → removed. `classifyAuthError` keeps the
   no-session case silent and logs the rest (`src/lib/auth-error.ts:12-17`).
2. **The 404 doubled as a catch-all with no log** → the 404 stays for the user, and every
   forbidden or 0-row branch now calls `logUnexpectedRefusal` (`src/lib/refusal-log.ts:27-29`).
3. **Failures returned as redirects** → the redirect stays (PRG, a product decision in
   structured-error-logs), but it now carries the stable `event: write_failed`.
4. **Services rebuilt errors from `message` only** → `serviceError` keeps `cause`. Only one bare
   `throw new Error(` remains (`src/lib/services/invites.ts:22`). It carries the code and leaves
   out `cause` on purpose, because the RPC `details` could contain the invite token.
5. **Log lines were fixed strings with no entity** → `errorLogFields` adds the UUIDs from the
   whitelist.

## 5. Findings by area (remaining)

### groups

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| V-1 | `src/lib/error-log.ts:42-62` (whitelist), used by every `logError` | identity-lost | low | A thrown, uncaught-in-code error logged through `logError` shows `name`, `code` and `message`, but no stack. A non-Supabase bug inside a degraded section (e.g. a `TypeError` in a mapper) is reported as `section_degraded … TypeError: x is undefined`, with no file or line. Supabase failures are unaffected, because their `code` is the diagnosis. | Optional: whitelist the first 1–3 stack frames for `name !== "Error"` (non-Supabase) errors only. Or accept it, since uncaught errors still go through Astro's 500 path with a full `err.stack`. |

No `Platform / plumbing` findings remain.

## 6. Recommended next steps

1. **Add Workers Logs alerts** (outside the repo) on `event = "auth_failed" AND kind = "outage"`,
   `event = "unexpected_refusal" AND level = error`, `event = "write_failed"` and
   `event = "config_missing"`. Without them, the fixes above make failures findable but not
   noticed.
2. **Optional runtime proof:** build the probe harness from `references/runtime-probes.md`. Stop
   the Auth container (P-1) and revoke `EXECUTE` on `set_child_attendance` (G-1), so the next
   verify run can compare with runtime evidence instead of only static evidence.
3. V-1, only if a non-Supabase bug ever proves hard to locate.

## 7. Changes since last audit

| Previous id | Status | Evidence |
|---|---|---|
| P-1 | fixed | `src/middleware.ts:33-53` reads `error`. `classifyAuthError` (`src/lib/auth-error.ts:12-17`) logs `session_rejected` at warn and `outage` at error, then returns 503 on `/api/*` and protected routes (`next("/503")`). `src/pages/503.astro` exists. |
| P-2 | fixed | `src/lib/supabase.ts:7-16`: one `config_missing` per isolate with the names only (`configMissingLogFields`, `src/lib/error-log.ts:85-91`, unit-tested). The fix plan explicitly decided against throwing in production. `/join/<token>` gives 503 instead of 404 without config. |
| P-3 | fixed | `src/middleware.ts:64,73` log via `logError`, so the fields include `code` and `userId`. |
| P-4 | fixed (no change needed) | 16 bare `catch {}` sites, the same count as before: `formData()` parse failures and the clipboard fallback. |
| G-1 | fixed | `logUnexpectedRefusal` is called on the forbidden/0-row branch of all 10 write routes in `src/pages/api/groups/**` (13 call sites). It logs at `error` on upcoming-event refusals (`attendance.ts:59`, `driver.ts:97`). The user-facing 404 is unchanged. |
| G-2 | fixed | `src/lib/services/groups.ts:92-100`: a visible group with no own membership logs `unexpected_refusal` at `error` unless `is_app_admin` confirms an app admin (`missingMembershipLogLevel`, `:59-64`). |
| G-3 | changed | The `unknown` branch still answers 302 `?error=unknown`. The product decision in structured-error-logs kept PRG. It now emits `event: write_failed` with ids on every route (e.g. `attendance.ts:62`, `driver.ts:62,72`, `invite.ts:41`), so it can be found by event, but not by HTTP status. |
| G-4 | fixed | 11 `serviceError(...)` sites keep `cause`, and `errorLogFields` reads `code`/`message` from `cause`. The one remaining bare `throw` (`invites.ts:22`) puts the code in the message and leaves out `cause` on purpose (token in `details`). |
| G-5 | changed | The catches at `attendance.ts:51`, `driver.ts:84`, `join/[token].astro:31` and `dashboard.astro:23` now pass the error object to `logError`. Code and message survive, but the stack is deliberately left out by the whitelist. The residual is V-1. |
| G-6 | fixed | Every log line is a single object with `event`, `op` and the UUIDs (`errorLogFields`). 26 `logError` and 13 `logUnexpectedRefusal` call sites, and no direct `console.*` left. |
| G-7 | fixed | `src/pages/groups/[id].astro:77,90`, `terminy/[eventId].astro:82`, `statystyki.astro:40` and `dashboard.astro:23` log `event: section_degraded` with `groupId`/`userId`. |
| G-8 | fixed | `joinRedirect` sends `error` to `/join/<token>?error=unknown` (`src/lib/services/invites.ts:62-63`, unit-tested). `src/pages/join/[token].astro` shows a destructive `Alert` above the form, only for `unknown`. |

## 8. Method and limits

- Verify mode, a single area, done inline: every cited location from the previous report was
  re-read at `d4f0e1a`. Read in full: `src/middleware.ts`, `src/lib/supabase.ts`,
  `src/lib/error-log.ts`, `src/lib/auth-error.ts`, `src/lib/refusal-log.ts`,
  `src/lib/service-error.ts`, `getGroupWithAdmins`, `api/groups/events/attendance.ts`,
  `events/driver.ts` and `api/groups/join.ts`. Refusal branches spot-checked in `invite.ts` and
  `events/delete.ts`. Per-route counts of `rewrite("/404")`, `logUnexpectedRefusal` and `logError`
  were taken for all 11 routes.
- Sweep (`src/`, tests excluded): 0 direct `console.*` (`emitLog` uses `console[level]`),
  1 `throw new Error(` in services (down from 12), 11 `serviceError(` calls, 26 `logError(`,
  13 `logUnexpectedRefusal(`, 16 bare `catch {}` (unchanged).
- **Runtime proof not run**, the same as the baseline. No probe harness exists, so there is no
  before/after probe table. The structured fields reaching Workers Logs were confirmed once in
  production for `unexpected_refusal` (#88 step 3.8). The other events are verified statically and
  by unit tests (`error-log.test.ts`, `refusal-log.test.ts`, `auth-error` tests).
- Side note, not a finding: `api/groups/join.ts:27-28` (no client → `/dashboard`) is in practice
  unreachable, because without a client the middleware leaves `user = null` and `:22` redirects to
  signin first. Either way, `config_missing` is logged.
