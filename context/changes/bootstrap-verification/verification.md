---
bootstrapped_at: 2026-11-06T11:48:27Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: carpooling
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

# Bootstrap verification — carpooling

## Hand-off

Source: `context/foundation/tech-stack.md`

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: carpooling
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

CarPooling is a small, mobile-first web app built solo on a two-week MVP timeline, and its core needs are e-mail/password accounts with long sessions, a relational model (groups, memberships, children, events, declarations) and strict per-group data isolation. The 10x Astro Starter covers all of this out of the box: Supabase provides PostgreSQL plus auth, and its Row Level Security is the natural place to enforce the PRD's guardrail that no one outside a group can read or change its data — even by bypassing the UI. Astro with React islands and Tailwind fits a list-based, ~360 px-friendly interface, and TypeScript with Zod schemas at the API boundaries gives an AI agent explicit contracts to work from. No realtime, payments, AI or background jobs are required (refresh-to-see-updates satisfies the freshness NFR), so the edge runtime's limits on long-running work don't bite. Deployment goes to Cloudflare Pages via GitHub Actions with auto-deploy on merge to main. Key gotcha to address early: configure Supabase RLS policies from the first migration.

## Pre-scaffold verification

| Signal      | Value                                                      | Severity | Notes                                                       |
| ----------- | ---------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| npm package | not run                                                    | —        | `cmd_template` starts with `git clone`; no `create-*` CLI   |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-10-29T22:28:56Z | fresh    | from card `docs_url` via `gh api repos/.../ --jq .pushed_at` |

Local toolchain at run time (informational): git 2.56.0.windows.4, node v26.13.0, npm 11.20.0. The registry card says `runtime_version: node 22`, but the starter's `.nvmrc` pins `26.13.0`, which matches the local Node exactly.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20 top-level entries moved silently (`.env.example`, `.github/`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `AGENTS.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package.json`, `package-lock.json`, `public/`, `README.md`, `scripts/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`) plus `.gitignore` merged and `CLAUDE.md` sidelined
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold`
**`context/` from scaffold**: none shipped — nothing dropped
**.gitignore handling**: append-merged (cwd lines kept; scaffold lines de-duped and appended under `# from 10x-astro-starter`; `.DS_Store` and `.idea/` were already present)
**.bootstrap-scaffold cleanup**: left in place — the permission policy denied `rm -rf` on the cloned `.git/`. The cloned `.git/` was NOT moved up (cwd's own `.git/` untouched). Leftover contents: `.bootstrap-scaffold/.git/`, `.bootstrap-scaffold/.gitignore.consumed`. Delete manually.

`npm install` output (tail):

```
added 635 packages, and audited 636 packages in 2m
221 packages are looking for funding
11 moderate severity vulnerabilities
npm warn install-scripts 2 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts   workerd@1.20261023.1 (postinstall: node install.js)
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

Note: the esbuild and workerd postinstall scripts did not run, but checked afterwards both binaries work (`esbuild 0.28.2`, `workerd 2026-10-23`) and `npm run build` completes (exit 0). No action needed.

## Post-scaffold audit

**Tool**: `npm audit --json` (exit code 1 — informational)
**Summary**: 0 CRITICAL, 0 HIGH, 14 MODERATE, 0 LOW (0 INFO)
**Direct vs transitive**: 0/0/6/0 direct of total 0/0/14/0. Dependency tree: 347 prod, 294 dev, 157 optional, 780 total.

All 14 findings trace back to a single advisory: **minimatch — potential denial of service via globparts amplification** ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), affected `>=7.0.0 <11.0.1`), pulled in through the ESLint / typescript-eslint lint toolchain (dev-only, not shipped to the edge runtime). npm's suggested fixes are semver-major downgrades (`eslint@9.39.5`, `typescript-eslint@8.36.0`, `eslint-plugin-astro@1.7.0`); expect an upstream patch instead.

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

| Package                              | Direct | Affected range     | Via                                                             | Fix available                          |
| ------------------------------------ | ------ | ------------------ | --------------------------------------------------------------- | -------------------------------------- |
| minimatch                            | no     | 7.0.0 – 11.0.0     | GHSA-g3hv-75wg-m249 (root advisory)                             | eslint@9.39.5 (major)                  |
| @eslint-community/eslint-utils       | no     | —                  | eslint                                                          | yes                                    |
| @eslint/config-array                 | no     | >=0.23.0           | minimatch                                                       | eslint@9.39.5 (major)                  |
| @eslint/js                           | yes    | >=10.0.1           | eslint                                                          | @eslint/js@9.39.5 (major)              |
| @typescript-eslint/eslint-plugin     | no     | >=6.16.0           | @typescript-eslint/parser, type-utils, utils                    | typescript-eslint@8.36.0 (major)       |
| @typescript-eslint/parser            | no     | >=6.16.0           | @typescript-eslint/typescript-estree                            | eslint-plugin-astro@1.7.0 (major)      |
| @typescript-eslint/type-utils        | no     | >=6.16.0           | @typescript-eslint/typescript-estree, utils                     | typescript-eslint@8.36.0 (major)       |
| @typescript-eslint/typescript-estree | no     | >=6.16.0           | minimatch                                                       | eslint-plugin-astro@1.7.0 (major)      |
| @typescript-eslint/utils             | no     | >=6.16.0           | @typescript-eslint/typescript-estree                            | typescript-eslint@8.36.0 (major)       |
| eslint                               | yes    | >=10.0.0-alpha.0   | @eslint/config-array, minimatch                                 | eslint@9.39.5 (major)                  |
| eslint-plugin-astro                  | yes    | >=2.0.0            | @typescript-eslint/parser, eslint, eslint-plugin-jsx-a11y, typescript-eslint | eslint-plugin-astro@1.7.0 (major) |
| eslint-plugin-jsx-a11y               | yes    | —                  | eslint                                                          | eslint-plugin-astro@1.7.0 (major)      |
| eslint-plugin-react                  | yes    | —                  | eslint                                                          | yes                                    |
| typescript-eslint                    | yes    | *                  | @typescript-eslint/eslint-plugin, parser, typescript-estree, utils | typescript-eslint@8.36.0 (major)    |

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                    | Value                 |
| ----------------------- | --------------------- |
| bootstrapper_confidence | first-class           |
| quality_override        | false                 |
| path_taken              | standard              |
| self_check_answers      | null                  |
| team_size               | solo                  |
| deployment_target       | cloudflare-pages      |
| ci_provider             | github-actions        |
| ci_default_flow         | auto-deploy-on-merge  |
| has_auth                | true                  |
| has_payments            | false                 |
| has_realtime            | false                 |
| has_ai                  | false                 |
| has_background_jobs     | false                 |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- ~~Delete the leftover temp directory `.bootstrap-scaffold`~~ — done by the user after the run.
- `git init` is not needed — this directory already has its own repo history.
- Review `CLAUDE.md.scaffold` against your `CLAUDE.md` and decide what to keep (the starter also shipped `AGENTS.md`, which moved in as-is).
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
