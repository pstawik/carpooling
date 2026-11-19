// risk: auth-gate-roundtrip — facet: a saved signed-in session reaches /dashboard
// (cookie → middleware → SSR → profile read under the user's session) and stays
// signed in across a reload; the signed-out redirect is covered by seed.spec.ts.
// Modeled on tests/e2e/seed.spec.ts. Auth comes from the setup project's storageState.
import { test, expect } from "@playwright/test";

test("signed-in session reaches /dashboard with the user's own data and survives a reload", async ({ page }) => {
  // Open a protected page with the saved session.
  await page.goto("/dashboard");

  // The middleware lets the session through: no redirect to sign-in.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Logowanie" })).toBeHidden();

  // SSR resolved the user and read their profile: the greeting carries a name,
  // not the anonymous fallback "Cześć!".
  await expect(page.getByRole("heading", { level: 1, name: /^Cześć, .+!$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Twoje grupy" })).toBeVisible();
  await expect(page.getByText("Nie udało się wczytać grup.")).toBeHidden();
  await expect(page.getByRole("button", { name: "Wyloguj" })).toBeVisible();

  // A full SSR reload keeps the session (cookies written back by the server stay valid).
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Cześć, .+!$/ })).toBeVisible();

  // Nothing is created, so there is nothing to clean up. The shared test user is
  // not signed out: that could revoke the session other specs load.
});
