# First Cloudflare Workers deploy — carpooling

## Context

`context/foundation/infrastructure.md` (2026-11-06) chose **Cloudflare Workers + Static Assets**. The repo is already pointed at that target: `@astrojs/cloudflare` 14.4.3, wrangler 4.156.0, Astro 7.4.4, `wrangler.jsonc` with `name: "carpooling"`, an ASSETS binding and observability on, and `tech-stack.md` already set to `cloudflare-workers`. Nothing has been deployed yet. There is no hosted Supabase project, no CI deploy job, and no `supabase/migrations/`. This plan covers the first production deploy, the external integrations (Cloudflare account and token, hosted Supabase, Supabase Auth URLs and SMTP, GitHub secrets and environments), and automating it afterwards. The approved plan is saved to `context/deployment/deploy-plan.md` as the audit trail.

Legend: **[agent]** = Claude runs it. **[human]** = you run it (type `! <cmd>` in the prompt for interactive CLI steps, or use the dashboard). **⛔ gate** = do not continue until it is checked.

### Findings that correct or extend infrastructure.md (checked in `node_modules` and on the web, 2026-11-09)

1. **`cloudflare({ session: false })` does not exist** in adapter 14.4.3: its options are `imageService`, `sessionKVBindingName`, `imagesBindingName` and `prerenderEnvironment`. The adapter turns on KV sessions unless the **top-level Astro config** has `session: false` (`node_modules/@astrojs/cloudflare/dist/index.js:84`). Fix: `defineConfig({ session: false, ... })`.
2. **Placement syntax** in wrangler 4.156 is `"placement": { "mode": "targeted", "region": "aws:eu-central-1" }` (from the config schema).
3. **Two preview mechanisms exist.** `versions upload --preview-alias` (GA) **shares the production secrets**. The newer `wrangler preview` / Worker Previews is **open beta** (status string in wrangler 4.156) and has per-preview secrets (`wrangler preview secret put`). Previews are deferred to Phase 7.
4. **Supabase's default SMTP only delivers to members of your Supabase org.** Every other address gets "Email address not authorized", and the limit is about 2 emails/hour. With "Confirm email" on, real parents cannot sign up until custom SMTP is configured. ([Supabase SMTP docs](https://supabase.com/docs/guides/auth/auth-smtp), [changelog #29370](https://github.com/orgs/supabase/discussions/29370))
5. **`npm run smoke` can't safely run against production as it stands.** It signs up `smoke-<ts>@example.com`, which leaves junk users and bounced emails that hurt sender reputation, and it expects sign-in to work without confirmation, which fails once confirmation is on. It needs a read-only mode.
6. **The email-confirmation link lands on `/?code=…` and nothing exchanges the code.** `@supabase/ssr` uses PKCE, and there is no callback route. The user's email *is* confirmed, but they have to sign in by hand afterwards. Logged as a follow-up, not a blocker.
7. **Supabase Free projects pause after about 7 days of inactivity.** This is an edge case for a low-traffic MVP; see Phase 8.
8. **The Git Bash tool crashes on this machine** (`add_item … errno 1`). Run local commands in PowerShell.

---

## Phase 0 — Record the plan and fix the repo config  **[agent]**

- [x] Save this approved plan to `context/deployment/deploy-plan.md` (new folder).
- [x] `astro.config.mjs`: add top-level `session: false`. **Deviation:** I also set `cloudflare({ imageService: "passthrough" })`, because the adapter's default `cloudflare-binding` image service injected an unused implicit `IMAGES` (Cloudflare Images) binding, and nothing in `src/` uses `astro:assets`.
- [x] `wrangler.jsonc`: added `"placement": { "mode": "targeted", "region": "aws:eu-central-1" }`. Re-check it against the Supabase region in Phase 2.
- [x] `package.json` and `package-lock.json`: name changed to `carpooling`.
- [x] `scripts/smoke.mjs`: added `SMOKE_READONLY=1`.
- [x] `context/foundation/infrastructure.md`: corrected `session: false` and the placement syntax in place.
- [x] Verify:
  - `npx astro check` passes with 0 errors. `npm run build` passes and no longer prints the KV-session or Images-binding line.
  - `dist/server/wrangler.json` has `kv_namespaces: []`, no `images` and the targeted placement.
  - `npx wrangler deploy --dry-run` shows the bindings as **only `env.ASSETS`**, with an upload of 2061 KiB, or 462 KiB gzipped.
  - The read-only smoke against local `astro preview` passes 2/2.
  - **Not run locally:** the full write-path smoke, because Docker isn't installed on this machine. The CI `smoke` job covers it on push.
  - **Lint:** `npm run lint` fails locally with only `Delete ␍` errors. That predates this change: `core.autocrlf=true` gives a CRLF working tree over an LF index. The touched files have no other lint errors, and CI on Linux is unaffected. Follow-up: add `.gitattributes` (`* text=auto eol=lf`).
- [x] Commit on `deploy-infra-decision`: "Prepare config for first Workers deploy".

## Phase 1 — Cloudflare account and authentication  **[human]** ⛔

- [ ] Log in or sign up at dash.cloudflare.com and note the **Account ID** (Workers & Pages → right sidebar).
- [ ] **Edge case: no `workers.dev` subdomain.** In Workers & Pages → Overview, register one (e.g. `<you>.workers.dev`). Without it, the first `wrangler deploy` prompts interactively, and CI would fail on that prompt.
- [ ] `! npx wrangler login` opens a browser for OAuth. Then **[agent]** checks with `npx wrangler whoami`, which must show the right account.
  - *If you're behind a corporate proxy or the browser callback fails:* create the API token from Phase 5 now and set `$env:CLOUDFLARE_API_TOKEN` / `$env:CLOUDFLARE_ACCOUNT_ID` in PowerShell instead of using OAuth.
  - *If you have several accounts:* add `"account_id"` to `wrangler.jsonc` so wrangler doesn't prompt you to choose one.

## Phase 2 — Hosted Supabase project  **[human]** ⛔

- [ ] Create the project in **Central EU (Frankfurt) `eu-central-1`**, which is closest to Poland. If one already exists, check its region under Settings → General. Save the DB password in a password manager.
- [ ] Copy the **Project URL** and the **anon/publishable key** from Settings → API. **Never use the `service_role` key**: it bypasses RLS, and `SUPABASE_KEY` must be the anon key.
- [ ] **[agent]** Set `placement.region` in `wrangler.jsonc` to `aws:<that region>`.
- [ ] Optionally link the CLI for future migrations: `! npx supabase link --project-ref <ref>`. There are no migrations yet, so there's nothing to push. From here on, `npx supabase db push` to production is **human-only**, runs before the code that needs it, and stays additive (see the risk register).

## Phase 3 — Production secrets on the Worker  **[human]** ⛔

- [ ] In PowerShell: `! npx wrangler secret put SUPABASE_URL`, then `! npx wrangler secret put SUPABASE_KEY`, pasting each value at the prompt.
  - *Edge case: the Worker doesn't exist yet.* Wrangler offers to create a draft Worker first; accept. If that fails, do Phase 4's deploy first and set the secrets right after it. Until they're set, the app renders but shows "Supabase is not configured" on auth (`src/lib/supabase.ts` returns `null`).
  - *Don't* pipe values with `echo … |` in PowerShell, because it can add stray newlines or BOMs.
- [ ] **[agent]** checks with `npx wrangler secret list`, which shows names only.

## Phase 4 — First manual deploy  **[agent runs, after you approve]** ⛔

- [ ] `npm run build`, then `npx wrangler deploy`. Wrangler picks up the config that the Cloudflare Vite plugin redirects to.
- [ ] Check the deploy output:
  - the bindings list shows **only ASSETS**, with no SESSION KV;
  - the URL `https://carpooling.<subdomain>.workers.dev` is printed;
  - a version ID is recorded in `deploy-plan.md`.
- [ ] `npx wrangler deployments list` shows exactly one deployment.
- *If the deploy fails with an auth error (code 10000):* check that the token or account matches the `whoami` output.
- *If the bundle is too large or a module is missing:* confirm `nodejs_compat` is present, and read the build output from `dist/server`.

## Phase 5 — Wire up Supabase Auth  **[human]** ⛔

- [ ] In Supabase → Authentication → URL Configuration:
  - **Site URL** = `https://carpooling.<subdomain>.workers.dev`
  - **Redirect URLs** = `https://carpooling.<subdomain>.workers.dev/**`, plus `http://localhost:4321/**` for dev.
- [ ] Decide on email confirmation:
  - **Recommended for production:** turn on "Confirm email" and configure custom SMTP (Brevo needs only sender-address verification; Resend or Postmark need a domain you own). Add the SMTP host, port, user and key under Authentication → SMTP Settings, then raise the email rate limit.
  - **Interim, if you don't have SMTP yet:** leave "Confirm email" on and invite only org members, or turn confirmation **off** temporarily and note it in the risk register. Don't invite real parents while default SMTP is active.
- [ ] Turn on leaked-password protection if your plan offers it, and confirm the minimum password length.

## Phase 6 — Verify production  **[agent + human]**

- [ ] **[agent]** In PowerShell: `$env:BASE_URL="https://carpooling.<sub>.workers.dev"; $env:SMOKE_READONLY="1"; npm run smoke`. Both steps must pass.
- [ ] **[human]** Sign up by hand with a real inbox:
  1. Receive the email; this proves SMTP works.
  2. Click the link; you land on `/` (finding 6).
  3. Sign in.
  4. Open `/dashboard`.
  5. Sign out.
  Then delete the test user in Supabase → Authentication → Users.
- [ ] **[agent]** `npx wrangler tail --format pretty --status error` runs during the manual test and must show no exceptions.
- [ ] **[human/agent]** In Workers Observability, look at **CPU time per request** for `/`, `/dashboard` and the `/api/auth/*` routes. If p99 is above ~7 ms, upgrade to Workers Paid ($5/mo) **before** inviting users. This is the risk register's top risk (error 1102).
- [ ] Check the 360 px mobile view on the deployed URL (home and auth pages).
- [ ] Record the URL, version ID, CPU numbers and SMTP decision in `deploy-plan.md`.

## Phase 7 — Automate deploys in CI  **[agent writes, human approves the merge]**

- [ ] **[human]** Create the Cloudflare API token from the "Edit Cloudflare Workers" template:
  - Account resources: **only this account**.
  - Zone resources: **none / no zones**, since there's no custom domain yet.
  - Set an expiry date and a client IP filter if practical.
- [ ] **[human]** In GitHub → Settings → Environments, create a `production` environment with **required reviewer = you**. That is the human gate for publishing. Add the environment secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- [ ] **[agent]** Add a `deploy` job to `.github/workflows/ci.yml`:
  - It runs only on `push` to `main` (`needs: [ci, smoke]`), with `environment: production` and `concurrency: { group: production, cancel-in-progress: false }`.
  - Steps: checkout, setup-node 26, `npm ci`, `npm run build`, `npx wrangler deploy`. This uses the wrangler pinned in the lockfile rather than `wrangler-action`, so the version matches local exactly.
  - It ends with a read-only smoke against the production URL. A failure turns the job red, and **rollback stays human-only**: `npx wrangler deployments list`, then `npx wrangler rollback <id> -m "<reason>"`.
- [ ] Previews are **not added now**. When they're wanted, use `wrangler preview` (open beta) with a **separate Supabase project** and per-preview secrets, and never `versions upload --preview-alias` with production secrets. Fork PRs never get previews.
- [ ] Update the README "Deployment" and "CI" sections: the URL, the secrets list, the rollback commands, and the readonly smoke mode.
- [ ] Open a PR from `deploy-infra-decision` to `main`. When it merges, the first automated deploy waits for environment approval. Approve it and confirm `deployments list` shows a new version.

## Phase 8 — Operational edge cases and follow-ups (track; not blocking)

- [ ] **Supabase Free auto-pause** after about 7 days idle. Either accept it (unpause in the dashboard) or add a weekly scheduled GitHub Action that runs the read-only smoke. That hits the auth API only for `/dashboard`, so it may not count as DB activity. Better: a cheap `select` via a `/api/health` endpoint, added later.
- [ ] **Follow-up change:** an `/auth/callback` route that calls `exchangeCodeForSession`, plus `emailRedirectTo` in `signup.ts`, so confirmation signs the user in (finding 6). Open it as a new `context/changes/` item.
- [ ] **Custom domain later:** add it to Supabase Redirect URLs *before* switching DNS. Sessions are lost once because the cookie origin changes. DNS changes are human-only.
- [ ] **Secret rotation:** `wrangler secret put` creates a new version, so revoke the old key in Supabase only after that. Rotation is human-only.
- [ ] **Rollback blockers:** don't delete bindings or resources that older versions reference, and keep migrations additive and backward-compatible.
- [ ] If an MCP is wanted: use only `mcp.cloudflare.com/mcp` / `docs.mcp.cloudflare.com/mcp`, never the deprecated per-product servers.

## Critical files

- `astro.config.mjs`, `wrangler.jsonc`, `package.json`, `scripts/smoke.mjs`
- `.github/workflows/ci.yml` (deploy job)
- `README.md`, `context/foundation/infrastructure.md` (corrections)
- `context/deployment/deploy-plan.md` (new)

## Verification summary

- **Local:** lint, `astro check` and build pass with no KV session log line, and the full smoke passes against local Supabase.
- **Production:** the read-only smoke passes against `workers.dev`, the manual real-email signup and sign-in loop works, `wrangler tail` shows no errors, and CPU p99 is under 7 ms (or the Paid plan is in place).
- **CI:** the merge to `main` shows ci → smoke → deploy (approved) → readonly smoke all green, and `wrangler deployments list` shows the new version.
