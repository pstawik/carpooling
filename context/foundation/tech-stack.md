---
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
---

## Why this stack

CarPooling is a small, mobile-first web app built solo on a two-week MVP timeline, and its core needs are e-mail/password accounts with long sessions, a relational model (groups, memberships, children, events, declarations) and strict per-group data isolation. The 10x Astro Starter covers all of this out of the box: Supabase provides PostgreSQL plus auth, and its Row Level Security is the natural place to enforce the PRD's guardrail that no one outside a group can read or change its data — even by bypassing the UI. Astro with React islands and Tailwind fits a list-based, ~360 px-friendly interface, and TypeScript with Zod schemas at the API boundaries gives an AI agent explicit contracts to work from. No realtime, payments, AI or background jobs are required (refresh-to-see-updates satisfies the freshness NFR), so the edge runtime's limits on long-running work don't bite. Deployment goes to Cloudflare Pages via GitHub Actions with auto-deploy on merge to main. Key gotcha to address early: configure Supabase RLS policies from the first migration.
