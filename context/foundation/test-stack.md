# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.65.1
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/seed.spec.ts
- full-suite command: npx playwright test
- base URL: http://localhost:4399
- port: 4399 (E2E_PORT from .dev.vars; detected default 4321 from the Astro preview default, override with E2E_PORT)
- web server command: npm run build && npm run preview -- --port $E2E_PORT; reuseExistingServer outside CI
- auth setup project: setup (tests/e2e/auth.setup.ts), credentials from E2E_USERNAME / E2E_PASSWORD in .dev.vars
- storageState: playwright/.auth/user.json (gitignored)
- seed: tests/e2e/seed.spec.ts — protects auth-gate-redirect: an anonymous visitor to a protected page is redirected to /auth/signin
- browser CLI: playwright-cli (use `-s=carpooling`), command skill at .claude/skills/playwright-cli/SKILL.md
- updated: 2026-11-19
