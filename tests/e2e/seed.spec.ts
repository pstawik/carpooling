// Seed test: the pattern every generated E2E test copies.
// Protects: auth-gate-redirect — an anonymous visitor to a protected page is sent
// to the sign-in page and never sees protected content (PROTECTED_ROUTES in src/middleware.ts).
import { test, expect } from "@playwright/test";

// This risk IS the signed-out path, so opt out of the saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test("anonymous visitor to /dashboard is redirected to sign-in and sees no dashboard content", async ({ page }) => {
  await page.goto("/dashboard");

  await page.waitForURL(/\/auth\/signin/);
  await expect(page.getByRole("heading", { name: "Logowanie" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Twoje grupy" })).toBeHidden();

  // Nothing is created, so there is nothing to clean up. The shared test user is
  // not signed out: that could revoke the session other specs load.
});
