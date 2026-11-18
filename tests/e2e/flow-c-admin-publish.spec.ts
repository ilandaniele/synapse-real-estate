import { expect, test } from "@playwright/test";
import { ADMIN, adminLogin } from "./helpers";

test.describe("Flujo C — admin crea unidad, publica y el público lo ve", () => {
  test("crear villa V9, publicar, verla en /unidades y restaurar la versión anterior", async ({ page, browser }) => {
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

    await page.goto(`${ADMIN}/developments`);
    await page.getByTestId("dev-row-lomas-del-faro").click();
    await page.getByTestId("tab-publicar").click();
    await page.getByTestId("publication-diff-2").click();
    await expect(page.getByTestId("publication-diff-modal").getByTestId("diff-units-added")).toContainText("Villa 9");
    await page.keyboard.press("Escape");

    await page.getByTestId("publication-restore-1").click();
    await expect(page.getByTestId("publication-restore-modal").getByTestId("diff-units-removed")).toContainText("Villa 9");
    await page.getByTestId("publication-restore-confirm").click();
    await expect(page.getByTestId("publication-row-3")).toContainText("restaurada de v1");

    const visitor = await browser.newPage({ baseURL: test.info().project.use.baseURL, locale: "es-ES" });
    await visitor.goto("/unidades");
    await expect(visitor.getByTestId("unit-row-V6")).toBeVisible();
    await expect(visitor.getByTestId("unit-row-V9")).toHaveCount(0);
    await visitor.close();
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
