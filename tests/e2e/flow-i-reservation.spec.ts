import { expect, test } from "@playwright/test";
import { adminLogin } from "./helpers";

test.describe("Flujo I — reserva con señal (pago simulado)", () => {
  test("ficha -> reservar -> pago rechazado -> pago aprobado -> reserva pagada en el admin", async ({ page }) => {
    await page.goto("/unidades/villa-5");
    await page.getByTestId("sheet-reserve-link").click();
    await expect(page).toHaveURL(/\/reservar\/villa-5$/);

    await page.getByTestId("reservation-submit").click();
    await expect(page.getByTestId("reservation-form").getByRole("alert")).toHaveCount(3);

    await page.getByTestId("reservation-name").fill("Comprador E2E");
    await page.getByTestId("reservation-email").fill("comprador.e2e@example.test");
    await page.getByTestId("reservation-consent").check();
    await page.getByTestId("reservation-submit").click();

    await expect(page.getByTestId("reservation-checkout")).toBeVisible();
    await page.getByTestId("reservation-decline").click();
    await expect(page.getByTestId("reservation-error")).toContainText("rechazado");

    await page.getByTestId("reservation-pay").click();
    await expect(page.getByTestId("reservation-paid")).toContainText("V5");

    await adminLogin(page);
    await page.getByTestId("nav-reservations").click();
    await page.getByTestId("reservations-filter-status").selectOption("PAID");
    await expect(page.getByTestId("reservation-row-0")).toContainText("V5");
    await expect(page.getByTestId("reservation-status-0")).toHaveText("Pagada");
  });
});
