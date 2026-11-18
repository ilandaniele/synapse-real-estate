import { expect, test } from "@playwright/test";
import { adminLogin } from "./helpers";

test.describe("Flujo I — reserva con señal", () => {
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
  test("Stripe Checkout: redirige al pago alojado y confirma la reserva al volver", async ({ page, baseURL }) => {
    const reservationId = "6f1c2b9e-1d2a-4c3b-9a8e-0f1e2d3c4b5a";
    const returnUrl = `${baseURL}/reservar/villa-5?reservation=${reservationId}`;
    let statusCalls = 0;
    await page.route("**/api/v1/public/reservations", (route) =>
      route.fulfill({
        status: 201,
        json: { id: reservationId, checkoutToken: "t".repeat(43), unitCode: "V5", depositAmount: "3000.00", currency: "EUR", checkoutUrl: returnUrl },
      }),
    );
    await page.route(`**/api/v1/public/reservations/${reservationId}/status`, (route) => {
      statusCalls += 1;
      expect(route.request().headers()["x-checkout-token"]).toBe("t".repeat(43));
      return route.fulfill({ json: { status: statusCalls === 1 ? "PENDING" : "PAID", unitCode: "V5" } });
    });

    await page.goto("/reservar/villa-5");
    await page.getByTestId("reservation-name").fill("Comprador Stripe");
    await page.getByTestId("reservation-email").fill("comprador.stripe@example.test");
    await page.getByTestId("reservation-consent").check();
    await page.getByTestId("reservation-submit").click();

    await expect(page).toHaveURL(returnUrl);
    await expect(page.getByTestId("reservation-paid")).toContainText("V5");
    expect(statusCalls).toBeGreaterThanOrEqual(2);
  });

  test("Stripe Checkout cancelado: avisa y ofrece reintentar", async ({ page }) => {
    await page.goto("/reservar/villa-5?reservation=6f1c2b9e-1d2a-4c3b-9a8e-0f1e2d3c4b5a&cancelled=1");
    await expect(page.getByTestId("reservation-cancelled")).toBeVisible();
    await page.getByTestId("reservation-retry").click();
    await expect(page.getByTestId("reservation-form")).toBeVisible();
  });
});
