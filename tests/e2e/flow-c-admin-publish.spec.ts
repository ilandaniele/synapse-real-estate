import { expect, test } from "@playwright/test";
import { ADMIN, adminLogin } from "./helpers";

test.describe("Flujo C — admin crea unidad, publica y el público lo ve", () => {
  test("crear villa V9, publicar y verla en /unidades", async ({ page }) => {
    await adminLogin(page);
    await page.goto(`${ADMIN}/developments`);
    await page.getByTestId("dev-row-lomas-del-faro").click();
    await page.getByTestId("tab-unidades").click();

    await page.getByTestId("unit-create-open").click();
    const form = page.getByTestId("unit-form");
    await form.getByTestId("unit-field-code").fill("V9");
    await form.getByTestId("unit-field-name").fill("Villa 9");
    await form.getByTestId("unit-field-slug").fill("villa-9");
    await form.getByTestId("unit-field-price").fill("910000.00");
    await form.getByTestId("unit-field-interiorArea").fill("250");
    await form.getByTestId("unit-field-plotArea").fill("830");
    await form.getByTestId("unit-field-bedrooms").fill("4");
    await form.getByTestId("unit-field-bathrooms").fill("3");
    await form.getByTestId("unit-save").click();
    await expect(page.getByTestId("unit-row-V9")).toBeVisible();

    await page.getByTestId("tab-publicar").click();
    await page.getByTestId("publish-button").click();
    await expect(page.getByTestId("publish-result")).toContainText(/versi[oó]n\s*2/i);

    await page.goto("/unidades");
    await expect(page.getByTestId("unit-row-V9")).toBeVisible();
    await page.goto("/unidades/villa-9");
    await expect(page.getByTestId("unit-sheet")).toContainText("910.000");
  });

  test("VIEWER no ve acciones de escritura; login inválido muestra error", async ({ page }) => {
    await page.goto(`${ADMIN}/login`);
    await page.getByTestId("login-email").fill("owner@synapse.local");
    await page.getByTestId("login-password").fill("wrong-password");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("login-error")).toBeVisible();

    await adminLogin(page, "viewer@synapse.local");
    await page.goto(`${ADMIN}/developments`);
    await page.getByTestId("dev-row-lomas-del-faro").click();
    await page.getByTestId("tab-unidades").click();
    await expect(page.getByTestId("unit-row-V6")).toBeVisible();
    await expect(page.getByTestId("unit-create-open")).toHaveCount(0);
  });
});
