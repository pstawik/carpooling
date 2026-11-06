---
project: carpooling
researched_at: 2026-11-06
recommended_platform: Cloudflare Workers (Static Assets)
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7 (SSR) + React 19 islands, @astrojs/cloudflare 14
  runtime: Cloudflare workerd (nodejs_compat)
---

## Recommendation

**Deploy on Cloudflare Workers with Static Assets** (not Cloudflare Pages).

The repo already targets this platform: `@astrojs/cloudflare` v14, `wrangler.jsonc` with an assets binding, and `astro:env/server` secrets. The migration cost is zero. Workers scored 5/5 on the agent-friendly criteria, the same as Vercel. The tie went to Workers because the developer already knows Cloudflare and because the Workers Free plan (100k requests/day) covers the PRD's low traffic at $0. The other interview answers fit too: requests are stateless with no persistent connections, users are in one region (Poland), and the data layer is an external Supabase. Neither the edge runtime's limits nor the absence of co-located services matters here.

**Correction to `tech-stack.md`:** it says `deployment_target: cloudflare-pages`. The Astro Cloudflare adapter no longer supports Pages, and Cloudflare tells new projects to start on Workers. The target is **Workers + Static Assets**.

## Platform Comparison

Scoring: Pass = 1, Partial = 0.5, Fail = 0. The criteria come from the skill's bundled agent-friendly criteria. Research date: 2026-11-06.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | **5.0** |
| Vercel | Pass | Pass | Pass | Pass | Pass | **5.0** |
| Railway | Partial | Pass | Pass | Pass | Pass | **4.5** |
| Netlify | Partial | Pass | Pass | Pass | Pass | 4.5 (weighted down) |
| Render | Partial | Pass | Pass | Pass | Partial | 4.0 |
| Fly.io | Partial | Partial | Pass | Pass | Pass | 4.0 |

- **Cloudflare Workers**
  - **CLI:** `wrangler deploy`, `versions upload|deploy`, `deployments list`, `rollback` (any of the last 100 versions) and `tail`. The repo already uses `@astrojs/cloudflare` 14.4.x; `astro dev` and `astro preview` run on workerd through the Cloudflare Vite plugin.
  - **Docs:** `developers.cloudflare.com/llms.txt`, plus a per-product `llms.txt`.
  - **MCP:** official servers at `mcp.cloudflare.com/mcp` and `docs.mcp.cloudflare.com/mcp`. The older Bindings, Builds and Observability MCP servers are **deprecated**.
  - **Cost:** the Free plan includes 100k requests/day and 10 ms of CPU per request. The Paid plan is $5/month.
- **Vercel**
  - **CLI:** `deploy --prod`, `promote`, `rollback` and `logs`. On Hobby, Instant Rollback only goes back to the immediately previous deployment.
  - **Docs:** `llms.txt`, and the docs pages are served as markdown.
  - **MCP:** Vercel MCP at `mcp.vercel.com`, OAuth-based, available on all plans, with no beta label.
  - **Runtime and adapter:** Node on Fluid compute (GA). `@astrojs/vercel` 11 supports Astro 7.
  - **Costs counted against it:**
    - Hobby is limited to personal, non-commercial use.
    - Functions default to `iad1` (US East) and must be pinned to `fra1`. Hobby allows only one region.
    - Hobby functions that sit idle for 2 weeks are archived, which adds at least 1 s to the next cold start.
    - Switching requires an adapter migration.
- **Railway**
  - **Runtime:** an always-on Node container built with Railpack. Nixpacks is deprecated.
  - **CLI:** `up`, `redeploy`, `logs --json`. Rollback is **dashboard-only** and limited to 72 h on Hobby, so CLI-first scores Partial.
  - **Docs:** `llms.txt`, plus `.md` pages.
  - **MCP:** remote `mcp.railway.com` or local `railway mcp`.
  - **Cost and region:** Hobby is $5/month with $5 of usage included. The only EU region is Amsterdam.
  - **Deprecation:** `railway.json`/`railway.toml` config stops working on **2026-12-01**; its replacement, `.railway/railway.ts`, has no maturity label.
  - **Needed to switch:** `@astrojs/node`, a `start` script, and `HOST=0.0.0.0`.
- **Netlify**
  - **On the criteria:** the CLI deploys with `deploy --prod` but has **no rollback command**; rollback goes through the UI or the API. Its MCP server is official, and docs have `llms.txt` plus `.md` pages.
  - **Why it was weighted down:**
    - Functions default to `cmh` (Ohio). Choosing another region, such as `fra`, requires **Pro**. That works against the single-region answer, because every call to an EU Supabase would cross the Atlantic.
    - Since 2025-09 the Free plan is 300 credits/month as a **hard cap**, and running out **pauses every site**. A production deploy costs 15 credits.
  - **Runtime support:** WebSockets are not supported. Astro 7 is supported by `@astrojs/netlify` 8.2.
- **Render**
  - **CLI and API:** the `render` CLI (installable via winget) deploys and streams logs. Rollback works only from the Dashboard or the API, and a Dashboard rollback turns off autodeploy.
  - **Docs:** `llms.txt`, plus `.md` pages.
  - **MCP:** a hosted server at `mcp.render.com`; the docs don't say whether it is GA.
  - **Cost:**
    - Free instances spin down after 15 minutes idle, and waking one takes **about 1 minute**, which is unacceptable for a mobile app used just before activities.
    - Starter costs $7/month.
    - In 2026-08 the Hobby plan's included bandwidth was cut to 5 GB.
  - **Region:** Frankfurt is available, but a service's region can't be changed after creation.
- **Fly.io**
  - **Fit:** runs any container.
  - **CLI:** `fly deploy` with rolling, canary or blue-green strategies, and `fly logs`. There is no rollback command; you redeploy an old image with `fly deploy -i <image>`.
  - **Docs and MCP:** `llms.txt` and `fly mcp server`; the MCP server's maturity isn't stated.
  - **Costs counted against it:**
    - **No free tier**: only a $1/7-day trial credit, then roughly $0.5–4/month with auto-stop.
    - **The Warsaw region (`waw`) was removed** in the region consolidation; Frankfurt is the nearest.
    - You maintain a Dockerfile.
    - Cold starts from a stopped machine take about 2 s or more.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

- **No migration:** it is already the scaffolded target, with the adapter, `wrangler.jsonc`, `astro:env` and dev on workerd in place.
- **Agent-friendly:** passes all five criteria. Deploy and rollback are deterministic one-liners, and logs can be tailed from the terminal.
- **Cost:** $0 at PRD traffic.
- **Familiarity:** the developer already knows Cloudflare.
- **Latency:** the edge doesn't help for a single region, but it doesn't hurt either, as long as placement is configured near Supabase.

#### 2. Vercel

- **Strengths:** equally strong agent tooling (CLI, MCP, docs) and a mature Node runtime with no 10 ms CPU ceiling.
- **Gaps vs. Workers:**
  - It requires an adapter migration and pinning the region to `fra1`.
  - The non-commercial Hobby restriction is a risk if the app ever charges money.
  - Hobby rollback goes back only one deployment.

#### 3. Railway

- **Strengths:** a plain always-on Node container, which is the simplest mental model and has no CPU-per-request limit. It costs about $5/month.
- **Gaps vs. Workers:**
  - Rollback is dashboard-only and only within a time window.
  - The config format is deprecated on 2026-12-01.
  - Switching needs an adapter swap and a `start` script.
  - The nearest region is Amsterdam.
  - The app goes to sleep when idle, so the first request after that can be slow or return a 502.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **10 ms CPU per request on the Free plan.** Rendering Astro + React on the server plus parsing Supabase JSON and cookies can occasionally exceed it. The request then fails with error 1102, typically at the evening peak, when the event page is heaviest. Network wait on Supabase does not count toward the limit.
2. **Sequential round trips to Supabase.** A Worker runs at the point of presence nearest the user. An SSR page that makes 3–4 Supabase calls one after another pays the full round trip for each. If the Supabase project is outside the EU, pages are noticeably slow unless `placement.region` is set.
3. **Previews share production.** Version preview URLs on `workers.dev` are public. They use production secrets, and therefore the production Supabase project, unless that is configured separately.
4. **Rollback is code-only.** `wrangler rollback` restores a Worker version. It does not revert Supabase migrations shipped alongside it, and a schema change that isn't backward-compatible breaks the rolled-back code.
5. **Resources provisioned implicitly.** The adapter auto-creates a `SESSION` KV namespace on deploy unless `session: false` is set. Wrangler also uses the starter's worker name `10x-astro-starter` as the public `workers.dev` hostname.

### Pre-Mortem — How This Could Fail

The team kept Workers because the starter already targeted it and deployed on the Free plan without measuring CPU time. In the evening rush before activities, the SSR event view started intermittently failing with CPU-limit errors, and parents saw error pages exactly when they needed the plan. Nobody had looked at the CPU-time chart in Workers Observability. The Supabase project had been created in a default US region, so each page made four transatlantic round trips, and the "fast edge" app felt sluggish. Preview versions pointed at the production database, and a feature-branch migration altered a shared table. `wrangler rollback` restored the old code but not the old schema, and the app stayed broken until someone fixed the schema by hand. Supabase Auth's Site URL still pointed at `localhost`, so password-reset e-mails led nowhere. Meanwhile the Pages-based CI recipe copied from an old tutorial didn't match the adapter. The platform itself never failed. The failures came from defaults nobody consciously chose: plan, region, preview isolation, migration discipline and auth URLs.

### Unknown Unknowns

- **Pages is a dead end for this adapter.** `@astrojs/cloudflare` v14 does not support Pages. Ignore Pages-era tutorials (`wrangler pages deploy`, `_routes.json`, `Astro.locals.runtime`, which has been removed). Read env only via `astro:env/server` or `import { env } from "cloudflare:workers"`.
- **`wrangler dev` is redundant.** `astro dev` and `astro preview` already run on workerd through the Cloudflare Vite plugin, and local secrets come from `.dev.vars`. Production secrets must be set separately with `wrangler secret put`.
- **Version previews have limits.** Preview URLs (`versions upload --preview-alias <name>`) work only on `workers.dev`, and their logs do **not** appear in `wrangler tail`.
- **Several Cloudflare MCP servers are deprecated.** The per-product Bindings, Builds and Observability MCP servers are deprecated in favour of the unified `mcp.cloudflare.com/mcp`. Older setup guides point at the deprecated ones.
- **Supabase Auth needs the deployed origins.** Its Site URL and Redirect URLs must list every deployed origin: the `workers.dev` hostname, the preview aliases, and later the custom domain. Moving to a custom domain changes the cookie origin, so existing sessions are lost once.

## Operational Story

- **Preview deploys**:
  - **Creation:** CI runs `wrangler versions upload --preview-alias pr-<n>` on each PR, which serves the preview at `pr-<n>-<worker>.<subdomain>.workers.dev`. It works only on `workers.dev`.
  - **Access:** previews are public. Protect them with Cloudflare Access, or accept that they are public because RLS guards the data.
  - **Data:** previews should use a separate Supabase project, not production.
  - **Fork PRs:** they get no preview, because repository secrets are unavailable to fork PRs.
- **Secrets**:
  - **Runtime:** `SUPABASE_URL` and `SUPABASE_KEY` live in Workers Secrets (`wrangler secret put SUPABASE_URL`) and are read via `astro:env/server`.
  - **CI:** CI holds `CLOUDFLARE_API_TOKEN` (scoped to "Edit Workers" for one account) and `CLOUDFLARE_ACCOUNT_ID` in GitHub Secrets. The CI build uses the Supabase secrets already in `@.github/workflows/ci.yml`.
  - **Local:** `.dev.vars`, which is never committed.
  - **Access:** only Cloudflare account members and GitHub admins can read them.
  - **Rotation:** run `wrangler secret put` again, which takes effect on a new version, then revoke the old key in Supabase.
- **Rollback**:
  - **Command:** `npx wrangler deployments list`, then `npx wrangler rollback <version-id> -m "<reason>"`.
  - **Time:** under a minute; any of the last 100 versions can be restored.
  - **Data caveat:** Supabase migrations are not rolled back. Keep migrations backward-compatible with the previous version (add-only, then clean up in a later release).
  - **Blocker:** rollback is blocked if a bound resource was deleted.
- **Approval**:
  - **Human only:**
    - publishing to production (merge to `main`);
    - `wrangler rollback` on production;
    - rotating or deleting secrets;
    - applying Supabase migrations to production;
    - deleting a Worker, KV namespace or Supabase project;
    - changing DNS or a custom domain.
  - **Agent may run unattended:** `wrangler versions upload` (previews), `wrangler deployments list`, `wrangler tail`, `wrangler versions list`, and read-only MCP/observability queries.
- **Logs**:
  - **CLI:** `npx wrangler tail --format pretty` (production; add `--status error` to filter).
  - **History:** `npx wrangler deployments list` and `npx wrangler versions list`.
  - **Observability:** Workers Observability is already enabled in `wrangler.jsonc` and can be queried via the `mcp.cloudflare.com/mcp` server.
  - **Pipeline:** `gh run view --log` for GitHub Actions.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| SSR requests exceed the Free plan's 10 ms CPU limit (error 1102) at the evening peak | Devil's advocate | M | H | After the first deploy, check CPU time per request in Workers Observability. If p99 is above ~7 ms, upgrade to Workers Paid ($5/mo) before inviting users. |
| Supabase project in a far region makes each SSR page slow (several sequential round trips) | Devil's advocate / Pre-mortem | M | M | Create or confirm the Supabase project in an EU region (e.g. Frankfurt), and set `placement.region = "aws:<supabase-region>"` in `wrangler.jsonc`. Batch queries per page. |
| Preview versions write to the production Supabase | Devil's advocate / Pre-mortem | M | H | Use a separate Supabase project (or branch) for previews. Never put production Supabase secrets on preview versions. RLS stays on in both. |
| Rollback restores code but not the schema | Devil's advocate / Pre-mortem | M | H | Keep migrations additive and backward-compatible with the previous release. Apply production migrations manually (human approval) before the code that needs them. |
| Following Pages-era docs (`wrangler pages deploy`, `Astro.locals.runtime`) breaks the build | Unknown unknowns / Research finding | M | M | Treat this file as the source of truth: target Workers + Static Assets only. Correct `deployment_target` in `tech-stack.md`. |
| Public `workers.dev` hostname carries the starter name `10x-astro-starter` | Unknown unknowns | H | L | Rename `name` in `wrangler.jsonc` to `carpooling` before the first `wrangler deploy`. |
| Supabase Auth redirect and site URLs missing the deployed origin, so sign-up and reset links break | Pre-mortem / Unknown unknowns | H | M | Add the `workers.dev` URL, preview aliases and the future custom domain to Supabase Auth → URL Configuration. Re-run `npm run smoke` against the deployed URL. |
| Adapter auto-provisions an unused `SESSION` KV namespace | Devil's advocate | H | L | Set `session: false` in `cloudflare()` options in `@astro.config.mjs` unless Astro sessions are adopted. |
| Agent tooling configured against deprecated Cloudflare MCP servers | Research finding (deprecated) | L | L | Use only `mcp.cloudflare.com/mcp` and `docs.mcp.cloudflare.com/mcp`. |
| Smart Placement (beta) or host-based placement (experimental) behaves unexpectedly | Research finding (beta) | L | M | Use an explicit `placement.region` hint (no beta label shown in the docs) instead of Smart Placement. |

## Getting Started

The commands below fit the pinned versions: `wrangler` ^4.156 and `@astrojs/cloudflare` ^14.4 are already devDependencies, so call wrangler with `npx wrangler`. Do not install it globally.

1. **Prepare the config.**
   - In `wrangler.jsonc`, set `"name": "carpooling"`.
   - Optionally add `"placement": { "region": "aws:<your-supabase-region>" }`.
   - In `astro.config.mjs`, use `cloudflare({ session: false })`, unless you need Astro sessions.
2. **Authenticate and set production secrets.**
   - Run `npx wrangler login`, then `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`, using the hosted Supabase project's URL and anon key.
   - Local development keeps using `.dev.vars` with `npm run dev`. `astro dev` already runs on workerd, so `wrangler dev` is unnecessary.
3. **Do the first deploy by hand.**
   - Run `npm run build && npx wrangler deploy`.
   - Wrangler deploys the `@astrojs/cloudflare/entrypoints/server` entry with `./dist` assets.
   - Note the `https://carpooling.<subdomain>.workers.dev` URL it prints.
4. **Wire up Supabase Auth and verify.**
   - Add that URL to Supabase Auth → URL Configuration (Site URL and Redirect URLs).
   - Run `BASE_URL=https://carpooling.<subdomain>.workers.dev npm run smoke`.
   - Check CPU time in Workers Observability.
5. **Automate deploys.**
   - Add a deploy job to `@.github/workflows/ci.yml` that runs on push to `main` after `ci` and `smoke` pass, using `cloudflare/wrangler-action@v4` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets and `command: deploy`.
   - Optionally add `versions upload --preview-alias pr-${{ github.event.number }}` for PRs.
   - Configuring the pipeline itself is the job of the Plan Mode deploy step.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
