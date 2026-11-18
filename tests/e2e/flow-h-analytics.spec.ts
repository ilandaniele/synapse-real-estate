import { expect, test, type Page } from "@playwright/test";
import { adminLogin, waitForPanorama } from "./helpers";

const visitPosted = (page: Page) => page.waitForResponse((response) => response.url().includes("/public/visits") && response.status() === 204);

test.describe("Flujo H — analítica de recorridos", () => {
  test("las visitas a la ficha y al tour aparecen en la analítica del admin", async ({ page }) => {
    const unitVisit = visitPosted(page);
    await page.goto("/unidades/villa-6");
    await unitVisit;

    const sceneVisit = visitPosted(page);
    await page.goto("/tour/villa-6");
    await waitForPanorama(page);
    await sceneVisit;

    await adminLogin(page);
    await page.getByTestId("nav-analytics").click();
    await expect(page.getByTestId("analytics-units")).toContainText("V6");
    await expect(page.getByTestId("analytics-scene-row").first()).toBeVisible();
    await page.getByTestId("analytics-days").selectOption("7");
    await expect(page.getByTestId("analytics-units")).toContainText("V6");
  });
});
