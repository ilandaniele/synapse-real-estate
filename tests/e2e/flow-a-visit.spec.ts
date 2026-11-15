import { expect, test } from "@playwright/test";
import { waitForPanorama } from "./helpers";

test.describe("Flujo A — visita arquitectónica 360 de Villa 6", () => {
  test("recorre estancias por hotspot, menú, plano y miniaturas @kiosk", async ({ page }) => {
    await page.goto("/tour/villa-6");
    await waitForPanorama(page, "exterior");

    // Hotspot navigation: exterior -> living.
    await page.getByTestId("hotspot-entrar-a-la-vivienda").click();
    await waitForPanorama(page, "living");

    // Room menu: living -> cocina.
    await page.getByTestId("tour-room-cocina").click();
    await waitForPanorama(page, "cocina");

    // Floor plan modal "Ir a un punto": cocina -> dormitorio.
    await page.getByTestId("tour-floorplan-button").click();
    const modal = page.getByTestId("floorplan-modal");
    await expect(modal).toBeVisible();
    await modal.getByTestId("floorplan-point-dormitorio").click();
    await waitForPanorama(page, "dormitorio");
    await expect(modal).toBeHidden();

    // Thumbnail strip: dormitorio -> bano.
    await page.getByTestId("scene-thumb-bano").click();
    await waitForPanorama(page, "bano");

    // Deep link to a scene.
    await page.goto("/tour/villa-6?scene=comedor");
    await waitForPanorama(page, "comedor");
  });

  test("cambios rápidos de estancia durante la transición no rompen el visor", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/tour/villa-6?scene=living");
    await waitForPanorama(page, "living");
    for (const slug of ["cocina", "comedor", "dormitorio", "bano", "living"]) {
      await page.getByTestId(`tour-room-${slug}`).click();
    }
    await waitForPanorama(page, "living");
    await page.getByTestId("tour-back").click();
    await expect(page).toHaveURL(/\/masterplan/);
    expect(errors).toEqual([]);
  });

  test("teclado: el visor recibe foco y los hotspots son botones accesibles", async ({ page }) => {
    await page.goto("/tour/villa-6?scene=living");
    const viewer = await waitForPanorama(page, "living");
    const hotspot = page.getByTestId("hotspot-comedor");
    await expect(hotspot).toHaveAttribute("aria-label", "Ir a Comedor");
    await hotspot.focus();
    await page.keyboard.press("Enter");
    await expect(viewer).toHaveAttribute("data-scene-slug", "comedor");
  });
});
