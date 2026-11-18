import { expect, test } from "@playwright/test";

test.describe("Idioma del showroom", () => {
  test("cambia a inglés, traduce la interfaz y recuerda la elección tras recargar", async ({ page }) => {
    await page.goto("/unidades");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByTestId("nav-unidades")).toHaveText("Unidades");
    await expect(page.getByTestId("unit-count")).toContainText("unidades");

    await page.getByTestId("locale-en").click();
    await expect(page.getByTestId("locale-en")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("nav-unidades")).toHaveText("Units");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Units");
    await expect(page.getByTestId("unit-count")).toContainText(" of ");
    await expect(page.getByTestId("filter-status").locator("option[value='AVAILABLE']")).toHaveText("Available");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("nav-unidades")).toHaveText("Units");
    await expect(page).toHaveTitle(/^Units · /);

    await page.getByTestId("locale-es").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByTestId("nav-unidades")).toHaveText("Unidades");
  });

  test("sin cookie usa Accept-Language", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("home-cta-masterplan")).toContainText("Explore the masterplan");
    await context.close();
  });
});
