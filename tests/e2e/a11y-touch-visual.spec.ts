import { expect, test } from "@playwright/test";
import { isInViewport, swipe, waitForMasterplan, waitForPanorama } from "./helpers";

test.describe("Accesibilidad por teclado", () => {
  test("el menú principal se recorre con Tab y tiene foco visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    const target = page.getByTestId("nav-masterplan");
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((el) => el === document.activeElement)) break;
    }
    await expect(target).toBeFocused();
    const outline = await target.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
    });
    expect(outline).not.toBe("none 0px none");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/masterplan/);
  });

  test("seleccionar una villa con teclado desde el listado", async ({ page }) => {
    await page.goto("/masterplan");
    await waitForMasterplan(page);
    await page.getByTestId("unit-row-V3").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("unit-card")).toContainText("Villa 3");
  });
});

test.describe("Táctil @touch", () => {
  test("menú móvil, tap en villa y tour con tap en hotspot", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile project only");
    await page.goto("/");
    await page.getByRole("button", { name: /men[uú]/i }).tap();
    await page.getByTestId("nav-masterplan").tap();
    await waitForMasterplan(page);
    await page.getByRole("button", { name: "Unidades y filtros" }).tap();
    await page.getByTestId("unit-row-V6").tap();
    await expect(page.getByTestId("unit-card")).toContainText("Villa 6");

    await page.goto("/tour/villa-6?scene=living");
    await waitForPanorama(page, "living");
    const hotspot = page.getByTestId("hotspot-comedor");
    const viewer = page.getByTestId("panorama-viewer");
    for (let i = 0; i < 20 && !(await isInViewport(page, hotspot)); i++) {
      const box = await hotspot.boundingBox();
      await swipe(page, viewer, box && box.x < 0 ? 0.4 : -0.4);
    }
    await hotspot.tap();
    await waitForPanorama(page, "comedor");
  });
});

test.describe("Regresión visual @visual", () => {
  for (const [name, path] of [
    ["home", "/"],
    ["unidades", "/unidades"],
    ["ficha-villa-6", "/unidades/villa-6"],
    ["contacto", "/contacto"],
  ] as const) {
    test(`captura ${name}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
    });
  }

  test("captura masterplan (canvas enmascarado)", async ({ page }) => {
    await page.goto("/masterplan");
    await waitForMasterplan(page);
    await expect(page).toHaveScreenshot("masterplan.png", { mask: [page.getByTestId("masterplan-canvas")] });
  });
});
