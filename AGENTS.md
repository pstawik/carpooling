# Repository Guidelines

CarPooling is a mobile-first web app for parents coordinating rides to kids' activities. Stack: Astro 7 SSR on Cloudflare Workers, React 19 islands, Tailwind 4, Supabase (Postgres + auth). Requirements: `@context/foundation/prd.md`. Setup and deployment details: `@README.md`.

## Hard Rules

- Enforce group data isolation in the database: every new table gets RLS enabled with per-operation, per-role policies in the same migration. UI or middleware checks alone are not enough.
- Parents may write only their own children's attendance and their own driver declarations; both become read-only once the event's start time passes. Enforce this server-side.
- A child without a declaration counts as "not going" and is shown with the "bez deklaracji" label; never treat a missing row as an error.
- `SUPABASE_URL` / `SUPABASE_KEY` are read only via `astro:env/server` (`@astro.config.mjs`); never import them into React components or anything shipped to the client.
- Never edit `context/archive/`; never commit `.env` or `.dev.vars`.

## Project Structure

- `src/pages/` routes; `src/pages/api/` endpoints export uppercase `GET`/`POST` and validate input with zod.
- `src/components/` Astro for static markup, React only for interactivity; shadcn/ui in `src/components/ui/`, added via `npx shadcn@latest add <name>`; React hooks in `src/components/hooks/`.
- `src/lib/` helpers (`@src/lib/supabase.ts` is the SSR client); business logic in `src/lib/services/`; shared entity/DTO types in `src/types.ts`.
- `@src/middleware.ts` puts the user on `context.locals.user`; add paths needing login to `PROTECTED_ROUTES`.
- `supabase/migrations/` SQL migrations named `YYYYMMDDHHmmss_short_description.sql`.
- `context/`: do not rename or move files in `context/foundation/`; record new work only as new folders in `context/changes/`.

## Commands

- `npm run dev` — dev server on workerd; needs `.dev.vars` (copy `.env.example`) and `npx supabase start`.
- `npm run lint` and `npx astro check` — must pass before commit.
- `npm run smoke` — auth-flow smoke test against a running server.

## Coding Style

Merge Tailwind classes with `cn()` from `@/lib/utils`, never by string concatenation; import via the `@/*` alias. No `"use client"` or other Next.js directives in React files. At a 360 px viewport: no horizontal scroll, touch targets at least 44 px, and every PRD action (child declaration, driver declaration, event plan) usable without zooming.

### UI

- Tokens live in `src/styles/global.css`; their values are in `.dark`, which is always on (`<html class="dark">` in `src/layouts/Layout.astro`). Positive status uses `--success` via `<Alert variant="success">`, never a palette green.
- Autofilled fields get their colour from the `--autofill` role via the `input:autofill` rule in the base layer of `src/styles/global.css`; never style `:autofill` in a component.
- Check `src/components/ui/` before creating a component; add missing ones via `npx shadcn@latest add <name>` and re-point the generated `cn` import to `@/lib/utils` (the CLI resolves it to the npm package `cn` here).
- No palette classes (`bg-purple-600`, `text-white`), hex/rgb/oklch literals or arbitrary values (`p-[13px]`) in views; use role tokens (`bg-primary`, `text-muted-foreground`, `border-input`, …).
- Kitchen sinks with the 7 component states: `/dev/ui-group`, `/dev/ui-event`, `/dev/ui-stats`, `/dev/ui-dashboard` and `/dev/ui-auth` (dev only); class constants they share with a view live in `src/components/groups/group-page-classes.ts`.
- `scripts/check-ui-literals.mjs` runs in `npm run lint`; append every newly cleaned view to its `CLEANED_VIEWS` list.

## Testing

There is no unit-test framework yet. Verification is lint, `astro check`, build, and `npm run smoke`, matching CI (`@.github/workflows/ci.yml`).

## Commits & PRs

Commit subjects are short, imperative, sentence case with no prefix (e.g. "Add PRD and resolve open questions"). CI runs on pushes and PRs to `main`.
