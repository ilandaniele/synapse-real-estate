import { expect, test } from "@playwright/test";
import { ADMIN, API, adminLogin, waitForPanorama } from "./helpers";

test.describe("Flujo D — editor visual de hotspots", () => {
  test("crear hotspot con clic, editar destino, previsualizar, publicar y navegar en público", async ({ page }) => {
    await adminLogin(page);
    // Find the "cocina" scene id through the API with the admin session cookie.
    const devs = await (await page.request.get(`${API}/api/v1/admin/developments`)).json();
    const dev = (Array.isArray(devs) ? devs : devs.items).find((d: { slug: string }) => d.slug === "lomas-del-faro");
    const scenes = await (await page.request.get(`${API}/api/v1/admin/developments/${dev.id}/scenes`)).json();
    const list = Array.isArray(scenes) ? scenes : scenes.items;
    const cocina = list.find((s: { slug: string }) => s.slug === "cocina");

    await page.goto(`${ADMIN}/scenes/${cocina.id}`);
    const editor = page.getByTestId("hotspot-editor");
    await expect(editor).toBeVisible();
    const viewer = await waitForPanorama(page, "cocina");
    const before = await page.locator("[data-testid^='hotspot-item-']").count();

    // Click on the panorama creates a hotspot (click, not drag).
    const box = await viewer.boundingBox();
    if (!box) throw new Error("viewer has no box");
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.55);
    await expect(page.locator("[data-testid^='hotspot-item-']")).toHaveCount(before + 1);

    await page.getByTestId("hotspot-label-input").fill("Ir al living");
    await page.getByTestId("hotspot-target-select").selectOption({ label: "Living" });
    await page.getByTestId("hotspot-save").click();
    await expect(page.getByTestId("hotspot-ir-al-living")).toBeVisible();

    // Preview mode navigates instead of editing.
    await page.getByTestId("preview-toggle").click();
    await page.getByTestId("hotspot-ir-al-living").click();
    await expect(viewer).toHaveAttribute("data-scene-slug", "living");

    // Publish and use it from the public tour.
    const pub = await page.request.post(`${API}/api/v1/admin/developments/${dev.id}/publish`);
    expect(pub.status()).toBe(201);
    await page.goto("/tour/villa-6?scene=cocina");
    await waitForPanorama(page, "cocina");
    await page.getByTestId("hotspot-ir-al-living").click();
    await waitForPanorama(page, "living");
  });
});
