import { expect, test } from "@playwright/test";
import { waitForPanorama } from "./helpers";

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

  test("en inglés muestra el contenido traducido y conserva el español donde no hay traducción", async ({ page }) => {
    await page.goto("/tour/villa-6?scene=exterior");
    await waitForPanorama(page, "exterior");
    await expect(page.getByTestId("tour-room-living")).toContainText("Living");
    await expect(page.getByTestId("hotspot-entrar-a-la-vivienda")).toBeVisible();

    await page.getByTestId("locale-en").click();
    await expect(page.getByTestId("tour-room-living")).toContainText("Living room");
    await expect(page.getByTestId("tour-room-cocina")).toContainText("Kitchen");
    await page.getByTestId("hotspot-go-inside").click();
    await waitForPanorama(page, "living");

    await page.goto("/unidades/villa-6");
    await expect(page.getByText("Four-bedroom villa with a double-height living room")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Villa 6");
  });
});
