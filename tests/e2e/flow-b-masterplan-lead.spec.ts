import { expect, test } from "@playwright/test";
import { API, waitForMasterplan, waitForPanorama } from "./helpers";

test.describe("Flujo B — masterplan, ficha, tour y lead", () => {
  test("masterplan -> Villa 6 -> ficha -> tour -> otra estancia -> volver con selección -> lead @kiosk", async ({
    page,
  }) => {
    await page.goto("/masterplan");
    const canvas = await waitForMasterplan(page);

    // Select Villa 6 via the accessible picking list (same handler as the 3D raycast).
    await page.getByTestId("masterplan-unit-V6").click();
    await expect(canvas).toHaveAttribute("data-selected-unit", /.+/);
    const card = page.getByTestId("unit-card");
    await expect(card).toContainText("Villa 6");
    await expect(card).toContainText("Disponible");
    await expect(card).toContainText("895.000");

    // Unit sheet.
    await card.getByTestId("unit-card-sheet-link").click();
    await expect(page).toHaveURL(/\/unidades\/villa-6/);
    const sheet = page.getByTestId("unit-sheet");
    await expect(sheet).toContainText("240");
    await expect(sheet).toContainText("820");

    // Tour and another room.
    await page.goto("/masterplan");
    await waitForMasterplan(page);
    await expect(page.getByTestId("unit-card")).toContainText("Villa 6"); // selection persisted
    await page.getByTestId("unit-card-tour-link").click();
    await waitForPanorama(page, "exterior");
    await page.getByTestId("tour-room-living").click();
    await waitForPanorama(page, "living");

    // Back keeps the selection.
    await page.getByTestId("tour-back").click();
    await expect(page).toHaveURL(/\/masterplan/);
    await waitForMasterplan(page);
    await expect(page.getByTestId("unit-card")).toContainText("Villa 6");

    // Lead from the unit sheet.
    await page.getByTestId("unit-card-sheet-link").click();
    const form = page.getByTestId("lead-form");
    await form.getByTestId("lead-name").fill("Prueba E2E");
    await form.getByTestId("lead-email").fill("e2e@example.com");
    await form.getByTestId("lead-message").fill("Quiero visitar la Villa 6");
    await form.getByTestId("lead-consent").check();
    await form.getByTestId("lead-submit").click();
    await expect(page.getByTestId("lead-success")).toBeVisible();
  });

  test("filtros sincronizados con el listado del masterplan", async ({ page }) => {
    await page.goto("/masterplan");
    await waitForMasterplan(page);
    await page.getByTestId("filter-status").selectOption("AVAILABLE");
    await expect(page.getByTestId("unit-row-V6")).toBeVisible();
    await expect(page.getByTestId("unit-row-V1")).toHaveCount(0);
    await page.getByTestId("search-input").fill("Villa 3");
    await expect(page.getByTestId("unit-row-V3")).toBeVisible();
    await expect(page.getByTestId("unit-row-V6")).toHaveCount(0);
  });

  test("lead: validación cliente, honeypot y consentimiento", async ({ page, request }) => {
    await page.goto("/contacto");
    const form = page.getByTestId("lead-form");
    await form.getByTestId("lead-submit").click();
    await expect(page.getByTestId("lead-success")).toHaveCount(0);
    await expect(form.getByRole("alert").first()).toBeVisible();

    // Server-side: missing consent is rejected, honeypot is silently accepted and dropped.
    const noConsent = await request.post(`${API}/api/v1/public/leads`, {
      data: { developmentSlug: "lomas-del-faro", name: "Bot", email: "bot@example.com" },
    });
    expect(noConsent.status()).toBe(400);
    const honeypot = await request.post(`${API}/api/v1/public/leads`, {
      data: { developmentSlug: "lomas-del-faro", name: "Bot", email: "bot@example.com", consent: true, website: "x" },
    });
    expect(honeypot.status()).toBe(202);
  });
});
