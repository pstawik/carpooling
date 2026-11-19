// risk: #1 + #5 (context/foundation/test-plan.md) — facet: a parent's child and driver declarations,
// submitted on the event page, go through the API, RLS and the database and come back in the
// SSR-rendered plan with the right seat-balance alert. The counting rule itself is covered by Vitest
// (src/lib/services/drivers.test.ts) and the HTTP redirects by smoke; neither renders the page.
// Modeled on tests/e2e/seed.spec.ts. Auth comes from the setup project's storageState; the group,
// children and event are seeded per test by tests/e2e/support/test-data.ts and deleted afterwards.
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { deleteSeededGroup, seedEventPlan } from "./support/test-data";

test.describe("event plan reflects the parent's declarations", () => {
  test("declaring children and seats on the event page shows the matching seat balance", async ({ page }) => {
    const token = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    test.info().annotations.push({ type: "test-data", description: `group "E2E plan ${token}"` });
    const { groupId, eventId, childNames } = await seedEventPlan(token);

    try {
      // Open the plan of a fresh event: nobody has declared anything yet.
      await page.goto(`/groups/${groupId}/terminy/${eventId}`);
      const balance = page.getByRole("region", { name: "Bilans miejsc" });
      const myChildren = page.getByRole("region", { name: "Twoje dzieci" });
      const childPlan = page.getByRole("region", { name: "Plan dzieci" });
      const myRide = page.getByRole("region", { name: "Twój przejazd" });

      await expect(balance.getByText("Żadne dziecko jeszcze nie jedzie")).toBeVisible();
      for (const name of childNames) {
        await expect(myChildren.getByRole("listitem").filter({ hasText: name })).toContainText("bez deklaracji");
      }

      // Declare both children going (each click posts a form and reloads the plan).
      for (const name of childNames) {
        const child = myChildren.getByRole("listitem").filter({ hasText: name });
        await child.getByRole("button", { name: "Jedzie", exact: true }).click();
        await expect(child).toContainText("— jedzie");
      }

      // 2 children going, 0 seats → "Brakuje 2 miejsc".
      await expect(childPlan.getByRole("heading", { name: "Jadą (2)" })).toBeVisible();
      await expect(balance.getByRole("alert")).toHaveText("Brakuje 2 miejsc");

      // Declare as a driver with 1 seat: 2 going, 1 seat → "Brakuje 1 miejsca".
      await myRide.getByLabel("Wolne miejsca dla dzieci (1–8)").fill("1");
      await myRide.getByRole("button", { name: "Jadę jako kierowca" }).click();
      await expect(myRide.getByText("Jedziesz jako kierowca: 1 miejsce")).toBeVisible();
      await expect(balance.getByRole("alert")).toHaveText("Brakuje 1 miejsca");

      // Raise to 2 seats: 2 going, 2 seats → equal counts are enough (PRD "Bilans miejsc").
      await myRide.getByLabel("Wolne miejsca dla dzieci (1–8)").fill("2");
      await myRide.getByRole("button", { name: "Zapisz miejsca" }).click();
      await expect(myRide.getByText("Jedziesz jako kierowca: 2 miejsca")).toBeVisible();
      await expect(balance.getByRole("status")).toHaveText("Miejsc wystarcza");
      await expect(balance.getByRole("alert")).toBeHidden();
    } finally {
      // The seeded group cascades to its children, event and both declarations; asserted inside.
      await deleteSeededGroup(groupId);
    }
  });
});
