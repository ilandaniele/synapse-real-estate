import { expect, test } from "@playwright/test";

const IDLE_MS = 90_000;
const WARNING_MS = 15_000;

test.describe("Modo kiosko", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  test("tras la inactividad avisa, vuelve a Inicio y borra la búsqueda del visitante @kiosk", async ({ page }) => {
    await page.goto("/unidades?kiosk=1");
    await expect(page.locator("html")).toHaveAttribute("data-kiosk", "true");
    await page.getByTestId("search-input").fill("Villa 6");

    await page.clock.runFor(IDLE_MS - 1_000);
    await expect(page.getByTestId("kiosk-idle-warning")).toHaveCount(0);
    await page.clock.runFor(1_000);
    const warning = page.getByTestId("kiosk-idle-warning");
    await expect(warning).toBeVisible();
    await expect(warning.getByTestId("kiosk-idle-countdown")).toHaveText("15");

    await page.clock.runFor(WARNING_MS);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("kiosk-idle-warning")).toHaveCount(0);
    await expect(page.getByTestId("home-hero")).toBeVisible();

    await page.getByTestId("nav-unidades").click();
    await expect(page.getByTestId("search-input")).toHaveValue("");
  });

  test("tocar «Seguir navegando» cancela la vuelta a Inicio @kiosk", async ({ page }) => {
    await page.goto("/unidades?kiosk=1");
    await page.getByTestId("search-input").fill("Villa 6");

    await page.clock.runFor(IDLE_MS);
    await page.getByTestId("kiosk-idle-continue").click();
    await expect(page.getByTestId("kiosk-idle-warning")).toHaveCount(0);

    await page.clock.runFor(WARNING_MS);
    await expect(page).toHaveURL(/\/unidades\?kiosk=1$/);
    await expect(page.getByTestId("search-input")).toHaveValue("Villa 6");
  });

  test("el modo queda activo al recargar y ?kiosk=0 lo apaga @kiosk", async ({ page }) => {
    await page.goto("/unidades?kiosk=1");
    await expect(page.locator("html")).toHaveAttribute("data-kiosk", "true");

    await page.goto("/galeria");
    await expect(page.locator("html")).toHaveAttribute("data-kiosk", "true");

    await page.goto("/galeria?kiosk=0");
    await expect(page.locator("html")).not.toHaveAttribute("data-kiosk", "true");
    await page.clock.runFor(IDLE_MS + WARNING_MS);
    await expect(page.getByTestId("kiosk-idle-warning")).toHaveCount(0);
    await expect(page).toHaveURL(/\/galeria\?kiosk=0$/);
  });

  test("fuera del modo kiosko no hay vuelta automática a Inicio", async ({ page }) => {
    await page.goto("/unidades");
    await page.clock.runFor(IDLE_MS + WARNING_MS);
    await expect(page.getByTestId("kiosk-idle-warning")).toHaveCount(0);
    await expect(page).toHaveURL(/\/unidades$/);
  });

  test("el manifiesto abre la app a pantalla completa en modo kiosko", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest.display).toBe("fullscreen");
    expect(manifest.start_url).toBe("/?kiosk=1");
  });
});
