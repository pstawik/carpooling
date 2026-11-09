# First Cloudflare Workers deploy — carpooling

## Context

`context/foundation/infrastructure.md` (2026-11-06) chose **Cloudflare Workers + Static Assets**. The repo is already pointed at that target: `@astrojs/cloudflare` 14.4.3, wrangler 4.156.0, Astro 7.4.4, `wrangler.jsonc` with `name: "carpooling"`, an ASSETS binding and observability on, and `tech-stack.md` already set to `cloudflare-workers`. Nothing has been deployed yet. There is no hosted Supabase project, no CI deploy job, and no `supabase/migrations/`. This plan covers the first production deploy, the external integrations (Cloudflare account and token, hosted Supabase, Supabase Auth URLs and SMTP, Workers Builds Git integration and GitHub branch protection), and automating it afterwards. The approved plan is saved to `context/changes/deployment/deployment-plan.md` as the audit trail.

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

## Prerequisites — tooling and accounts  **[human, one-time per machine]**

These steps set up the tools and accounts. Provisioning the real resources happens in Phases 1–5. Commands are for **PowerShell** on Windows. Checked against this repo on 2026-11-09.

### P1. Base tooling

- [x] **Node 26.13.0**, as in `.nvmrc`. Check with `node -v` (this machine: `v26.13.0` ✔). If it's missing, use nvm-windows (`nvm install 26.13.0; nvm use 26.13.0`) or fnm (`fnm use`, which reads `.nvmrc`).
- [x] **Dependencies:** `npm ci`. That installs the pinned CLIs used below as devDependencies: **wrangler 4.156.0** and **supabase 2.122.0**. *(Verified 2026-11-09: wrangler 4.156.0 is installed. Wrangler reports 4.158.0 is available; don't bump it as part of this change.)*
  - **Don't install wrangler or the Supabase CLI globally.** Always call them as `npx wrangler …` / `npx supabase …`, so local, CI and Workers Builds use the same versions.
- [ ] **Git line endings (edge case):** `core.autocrlf=true` here, so `npm run lint` locally fails on `Delete ␍`. Either run `git config core.autocrlf input` and then re-checkout (`git rm -r --cached . ; git reset --hard`; only on a clean tree), or add a `.gitattributes` with `* text=auto eol=lf` (a follow-up change).
- [ ] **Shell:** use PowerShell for every command in this plan. Git Bash crashes intermittently on this machine (finding 8). For interactive commands inside a Claude session, prefix them with `!`.

### P2. Cloudflare CLI (wrangler)

- [x] You need a Cloudflare account (free). The details are in Phase 1. *(Done, 2026-11-09.)*
- [x] Log in: `npx wrangler login` opens a browser for OAuth. On this machine the credentials are stored in `%APPDATA%\xdg.config\.wrangler\config\default.toml` (outside the repo). *(Done; OAuth token.)*
- [x] Check: `npx wrangler whoami` shows the expected email and account ID. *(Verified 2026-11-09: wrangler 4.156.0, one account, ID `4c40bd410fdcbbf87e6459aa0a9b2727`, OAuth scopes include `workers (write)`. A single account, so no `account_id` is needed in `wrangler.jsonc`.)*
- [ ] **Edge cases:**
  - **Browser callback blocked** (corporate proxy, remote shell, WSL): skip OAuth. Create a user API token ("Edit Cloudflare Workers" template, this account only, no zones). Then set it for the session: `$env:CLOUDFLARE_API_TOKEN="<token>"; $env:CLOUDFLARE_ACCOUNT_ID="<id>"`. Never write the token to a file in the repo.
  - **TLS/proxy errors:** set `$env:HTTPS_PROXY` and, if needed, `$env:NODE_EXTRA_CA_CERTS="<corp-root-ca.pem>"`.
  - **Telemetry (optional):** `npx wrangler telemetry disable`.
  - **Logging out:** `npx wrangler logout`, for example on a shared machine.
- [ ] Local dev doesn't need `wrangler dev`: `npm run dev` / `npm run preview` already run on workerd. Local runtime secrets come from `.dev.vars` (see P4).

### P3. Supabase CLI and local stack

- [ ] **Docker Desktop**, needed for the local stack. It is **not installed on this machine**, which is why the full smoke couldn't run in Phase 0.
  - Install it with the WSL 2 backend and give it about 7 GB RAM.
  - Check with `docker version`.
  - Edge case: corporate Windows may need admin rights or a Docker Desktop licence. In that case Podman works too, or skip the local stack and rely on the CI `smoke` job.
- [ ] **CLI version:** `npx supabase --version` should show 2.122.0. That's pinned on purpose: CI uses the same version, and `latest` broke on `config.toml` schema changes. Ignore the warning "`[inbucket]` is deprecated … use `[local_smtp]`" for now. Rename the section only when the CLI pin is bumped (in a follow-up change, keeping CI in sync).
- [ ] **Project config:** `supabase/config.toml` already exists (`project_id = "10x-astro-starter"`, Postgres `major_version = 17`), so **don't run `supabase init` again**. Leave `project_id` as it is; changing it renames the local Docker volumes and you'd lose local data.
- [ ] **Local auth URLs (fix as a small follow-up):** `[auth] site_url = "http://127.0.0.1:3000"` doesn't match the dev server, which runs on `4321`. Set `site_url = "http://localhost:4321"` and `additional_redirect_urls = ["http://localhost:4321/**", "http://127.0.0.1:4321/**"]` so local confirmation and reset links work.
- [ ] **Start the stack:** `npx supabase start`. The first run downloads images. Then `npx supabase status -o env` prints `API_URL` and `ANON_KEY`.
  - Local email confirmation is already **off** (`enable_confirmations = false`), so the full `npm run smoke` works locally.
  - Studio runs at `http://localhost:54323` and the test inbox at `http://localhost:54324`.
  - Edge case: ports 54321–54324 are already in use. Run `npx supabase stop --all`, or change the ports in `config.toml` (local only).
- [ ] **Stop the stack** with `npx supabase stop`. Add `--no-backup` to wipe local data.

### P4. Local env files (never committed; both are in `.gitignore`)

- [ ] `Copy-Item .env.example .env; Copy-Item .env.example .dev.vars`, then fill both with the local values:
  ```
  SUPABASE_URL=http://127.0.0.1:54321
  SUPABASE_KEY=<ANON_KEY from `npx supabase status -o env`>
  ```
- [ ] `.dev.vars` is what `astro dev`/`preview` (workerd) reads, and `.env` is for Astro/Node tooling. Keep them identical.
- [ ] **Check:**
  1. `npm run build`
  2. `npm run preview -- --port 4321` in one terminal
  3. `$env:BASE_URL="http://localhost:4321"; npm run smoke` in another; all 8 steps must pass.
- [ ] Edge case: "Supabase is not configured" on the auth pages means `.dev.vars` is missing or still has `###`. Restart the dev server after editing it.

### P5. Supabase cloud account and CLI link

- [x] **Account and org:** *(done; user confirmed 2026-11-09)* sign up at supabase.com (GitHub login is fine). Create or choose an **organization**. The Free plan allows **2 active projects** per org; keep one free slot for a future preview/staging project.
- [ ] **CLI login:** *(not done: on 2026-11-09 `npx supabase projects list` returned `AccessTokenRequiredError`. It's only needed for `link` and migrations, not for deploying.)* `npx supabase login` opens a browser and stores an access token in the OS credential store. On a headless machine or where the browser is blocked: create a personal access token under Account → Access Tokens and set `$env:SUPABASE_ACCESS_TOKEN="<token>"` for the session only.
- [x] **Create the hosted project** *(done; user confirmed 2026-11-09. Region verified as `eu-west-2` (London), Postgres 17 verified 2026-11-09)* (Phase 2): region **Central EU (Frankfurt)**, a generated DB password saved in a password manager, and Postgres 17 so it matches local `major_version = 17`.
- [ ] **Link the repo:** run `npx supabase link --project-ref <ref>`; it prompts for the DB password. This writes `supabase/.temp/` (gitignored by `supabase/.gitignore`).
  - Check with `npx supabase projects list`, which marks the linked project with ●.
  - Run `npx supabase migration list` to compare local and remote; both are empty for now.
  - Edge case: `link` fails on IPv6-only direct DB connections, or the corporate network blocks port 5432/6543. Retry from another network. Linking is needed only for migrations, not for the app.
- [ ] **API keys:** copy them from Project Settings → API Keys.
  - The app's `SUPABASE_KEY` must be the **publishable / `anon`** key: legacy JWT `eyJ…`, or new-style `sb_publishable_…`, both of which work with `@supabase/supabase-js`.
  - **Never** use `service_role` / `sb_secret_…` in `SUPABASE_KEY`: it bypasses RLS (an AGENTS.md hard rule).
  - `SUPABASE_URL` is `https://<ref>.supabase.co`.
- [ ] **Migration discipline from now on:**
  - Create migrations with `npx supabase migration new <name>`, named `YYYYMMDDHHmmss_short_description.sql`, with RLS in the same file.
  - Test them locally with `npx supabase db reset`.
  - Production gets them **only by a human**, via `npx supabase db push`, applied *before* merging the code that needs them, and additive only.
- [ ] **Auth settings** (dashboard): configured in Phase 5. Site URL and Redirect URLs come after the first deploy, then custom SMTP and Confirm email.
- [ ] **Hosted Supabase edge cases:**
  - **Free projects pause after about 7 days idle** (Phase 8). Restore them from the dashboard. They're deleted only after a long pause, so check the dashboard notice.
  - **Default SMTP is for org members only** (finding 4).
  - **Rotating keys:** with new-style keys, create a new publishable key, `wrangler secret put SUPABASE_KEY`, then delete the old key. Legacy JWT keys rotate only by rolling the JWT secret, which invalidates *all* sessions; that's human-only and should be avoided.

---

## Phase 0 — Record the plan and fix the repo config  **[agent]**

- [x] Save this approved plan to `context/changes/deployment/deployment-plan.md` (moved here from `context/deployment/deploy-plan.md` on 2026-11-09).
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

- [x] Log in or sign up at dash.cloudflare.com and note the **Account ID** (Workers & Pages → right sidebar). *(Done: `4c40bd410fdcbbf87e6459aa0a9b2727`.)*
- [x] **Edge case: no `workers.dev` subdomain.** *(Done 2026-11-09: `pstawik.workers.dev`; production URL `https://carpooling.pstawik.workers.dev`.)* In Workers & Pages → Overview, register one (e.g. `<you>.workers.dev`). Without it, the first `wrangler deploy` prompts interactively, and CI would fail on that prompt.
- [x] `! npx wrangler login` opens a browser for OAuth. Then **[agent]** checks with `npx wrangler whoami`, which must show the right account. *(Verified 2026-11-09, see P2.)*
  - *If you're behind a corporate proxy or the browser callback fails:* create the API token from Phase 5 now and set `$env:CLOUDFLARE_API_TOKEN` / `$env:CLOUDFLARE_ACCOUNT_ID` in PowerShell instead of using OAuth.
  - *If you have several accounts:* add `"account_id"` to `wrangler.jsonc` so wrangler doesn't prompt you to choose one.

## Phase 2 — Hosted Supabase project  **[human]** ⛔

- [x] Create the project in **Central EU (Frankfurt) `eu-central-1`**, which is closest to Poland. Save the DB password in a password manager. *(Project exists; user confirmed 2026-11-09.)*
- [x] **Check the existing project's region** under Settings → General. *(Checked 2026-11-09: the project is in **`eu-west-2` (London)**, not Frankfurt. Region can't be changed; accepted. Extra latency from Poland is small, and the Worker is placed next to the DB anyway.)*
- [ ] Copy the **Project URL** and the **anon/publishable key** from Settings → API. **Never use the `service_role` key**: it bypasses RLS, and `SUPABASE_KEY` must be the anon key.
- [x] **[agent]** Set `placement.region` in `wrangler.jsonc` to `aws:eu-west-2`. *(Done 2026-11-09.)*
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
  - the URL `https://carpooling.pstawik.workers.dev` is printed;
  - a version ID is recorded in this file.
- [ ] `npx wrangler deployments list` shows exactly one deployment.
- *If the deploy fails with an auth error (code 10000):* check that the token or account matches the `whoami` output.
- *If the bundle is too large or a module is missing:* confirm `nodejs_compat` is present, and read the build output from `dist/server`.

## Phase 5 — Wire up Supabase Auth  **[human]** ⛔

- [ ] In Supabase → Authentication → URL Configuration:
  - **Site URL** = `https://carpooling.pstawik.workers.dev`
  - **Redirect URLs** = `https://carpooling.pstawik.workers.dev/**`, plus `http://localhost:4321/**` for dev.
- [ ] Decide on email confirmation:
  - **Recommended for production:** turn on "Confirm email" and configure custom SMTP (Brevo needs only sender-address verification; Resend or Postmark need a domain you own). Add the SMTP host, port, user and key under Authentication → SMTP Settings, then raise the email rate limit.
  - **Interim, if you don't have SMTP yet:** leave "Confirm email" on and invite only org members, or turn confirmation **off** temporarily and note it in the risk register. Don't invite real parents while default SMTP is active.
- [ ] Turn on leaked-password protection if your plan offers it, and confirm the minimum password length.

## Phase 6 — Verify production  **[agent + human]**

- [ ] **[agent]** In PowerShell: `$env:BASE_URL="https://carpooling.pstawik.workers.dev"; $env:SMOKE_READONLY="1"; npm run smoke`. Both steps must pass.
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
- [ ] Record the URL, version ID, CPU numbers and SMTP decision in this file.

## Phase 7 — Automate deploys with Cloudflare Workers Builds  **[human configures, agent verifies]**

> **Decision (2026-11-09):** production auto-deploys on every push to `main`, run by **Cloudflare Workers Builds** (Cloudflare's Git integration). **No GitHub Actions deploy job.** The existing `ci` and `smoke` jobs in `.github/workflows/ci.yml` stay unchanged as checks. There is no `CLOUDFLARE_API_TOKEN` in GitHub and no GitHub `production` environment. Source: the Workers Builds docs (configuration, build-image, limits, troubleshoot), read 2026-11-09.

- [x] **GitHub repo exists:** `https://github.com/pstawik/carpooling` (`origin`). *(Verified 2026-11-09.)*
- [ ] **[human] Connect the repo.** Cloudflare dashboard → Workers & Pages → `carpooling` → Settings → Build → Connect. Install the Cloudflare GitHub App with access to **only this repository**, not all repos. Settings:
  - **Git branch:** `main`.
  - **Build command:** `npm run build`.
  - **Deploy command:** `npx wrangler deploy` (the default). It uses the wrangler pinned in `package.json`/lockfile, 4.156.0.
  - **Root directory:** blank (repo root).
  - **Preview builds for non-production branches: OFF.** The default preview command (`npx wrangler preview`) would publish branch builds. There's no separate preview Supabase project yet.
- [ ] **[human] Node version (edge case).** The build image preinstalls only Node 22 and 24 (default 24.22.1). Our `.nvmrc` says `26.13.0`, and the docs don't confirm Node 26 can be downloaded.
  - First build: let it read `.nvmrc`, then check the build log for the Node version that actually ran.
  - If the build fails or falls back to another version: set the build variable `NODE_VERSION=24.22.1` in Settings → Build → Variables. The app runs on workerd, not Node, so the Node version only affects the build. Then run a local `npm run build` on Node 24 once to confirm.
- [ ] **[human] Tighten the build token.** By default Builds auto-creates a token with Workers Scripts edit, **KV edit, R2 edit and Workers Routes edit on all zones**. Under My Profile → API Tokens, edit it down to Account Settings read and Workers Scripts edit for this account, plus User Details and Memberships read. Remove KV, R2 and zone access. Only *user* tokens are supported for now; account-owned tokens are "coming soon".
- [ ] **[human] Gate merges, because Builds doesn't wait for GitHub Actions.** Workers Builds deploys on push to `main` whether or not `ci` and `smoke` pass. Add a GitHub branch protection rule (or ruleset) on `main`:
  - require a PR;
  - require the `ci` and `smoke` status checks;
  - block direct and force pushes, including for admins.

  **Merging the PR is the human approval for production.**
- [ ] **Runtime secrets.** `SUPABASE_URL`/`SUPABASE_KEY` stay as Worker secrets from Phase 3, under Settings → Variables & Secrets. **Don't** add them as Build variables: those are build-only and invisible at runtime, and the build doesn't need them. `wrangler deploy` keeps the secrets already on the Worker.
- [ ] **Name check.** `wrangler.jsonc` `name` must equal the dashboard Worker name, `carpooling`. On a mismatch the build fails with "The name in your Wrangler configuration file … must match the name of your Worker". Don't add `account_id` unless it's correct; a wrong one fails with error 7003.
- [ ] **[agent] Verify the first Builds deploy.** Merge the PR from `deploy-infra-decision` to `main`, then:
  - the build log shows the Node version, `npm ci`, the build and the deploy, and the bindings list shows only `ASSETS`;
  - `npx wrangler deployments list` shows a new version, with the commit SHA as its source;
  - `SMOKE_READONLY=1` smoke against the production URL passes. This is no longer automatic, so run it after each deploy, or add it later as a GitHub Actions job that only checks (it doesn't deploy).
- [ ] **Failure handling.** A failed build leaves the previous version live. A bad *deployed* version needs a **human-only** rollback: `npx wrangler deployments list`, then `npx wrangler rollback <id> -m "<reason>"`. The next push to `main` will deploy again, so revert or fix on `main` as well.
- [ ] **Limits (Free plan):** 3,000 build minutes/month, 1 concurrent build (pushes queue), 20-minute timeout and 90-day log retention.
- [ ] Previews are **not added now**. Later options: turn on preview builds with `npx wrangler preview` (per-preview secrets, open beta) pointing at a **separate Supabase project**. Never use preview URLs that share production secrets. Fork PRs never get previews.
- [ ] Update the README "Deployment" and "CI" sections: auto-deploy through Workers Builds, the URL, where secrets live, the branch protection rule, the rollback commands and the read-only smoke.

## Phase 8 — Operational edge cases and follow-ups (track; not blocking)

- [ ] **Supabase Free auto-pause** after about 7 days idle. For now, accept it and unpause in the dashboard; no new GitHub Actions are planned. Later options: a Cloudflare Cron Trigger on the Worker, or a weekly scheduled GitHub Action that runs the read-only smoke. That hits the auth API only for `/dashboard`, so it may not count as DB activity. Better: a cheap `select` via a `/api/health` endpoint, added later.
- [ ] **Follow-up change:** an `/auth/callback` route that calls `exchangeCodeForSession`, plus `emailRedirectTo` in `signup.ts`, so confirmation signs the user in (finding 6). Open it as a new `context/changes/` item.
- [ ] **Custom domain later:** add it to Supabase Redirect URLs *before* switching DNS. Sessions are lost once because the cookie origin changes. DNS changes are human-only.
- [ ] **Secret rotation:** `wrangler secret put` creates a new version, so revoke the old key in Supabase only after that. Rotation is human-only.
- [ ] **Rollback blockers:** don't delete bindings or resources that older versions reference, and keep migrations additive and backward-compatible.
- [ ] If an MCP is wanted: use only `mcp.cloudflare.com/mcp` / `docs.mcp.cloudflare.com/mcp`, never the deprecated per-product servers.

## Critical files

- `astro.config.mjs`, `wrangler.jsonc`, `package.json`, `scripts/smoke.mjs`
- `.github/workflows/ci.yml` (unchanged; its `ci`/`smoke` jobs become required checks for merging to `main`)
- `README.md`, `context/foundation/infrastructure.md` (corrections)
- `context/changes/deployment/deployment-plan.md` (new)

## Verification summary

- **Local:** lint, `astro check` and build pass with no KV session log line, and the full smoke passes against local Supabase.
- **Production:** the read-only smoke passes against `workers.dev`, the manual real-email signup and sign-in loop works, `wrangler tail` shows no errors, and CPU p99 is under 7 ms (or the Paid plan is in place).
- **CI/CD:** the PR shows `ci` and `smoke` green before merge. After the merge, the Workers Builds log shows a successful build and deploy, `wrangler deployments list` shows the new version, and the read-only smoke passes.
