import { expect, test } from "@playwright/test";

const PASSWORD = "comprador-password-123";

test.describe("Flujo J — cuenta de comprador y favoritos", () => {
  test("registro -> guardar villa -> ver en Mi cuenta -> cerrar sesión -> ingresar -> quitar", async ({ page }) => {
    const email = `comprador.${Date.now()}@example.test`;

    await page.goto("/unidades");
    await expect(page.getByTestId("favorite-V6")).toHaveAttribute("href", "/cuenta");
    await page.getByTestId("nav-account").click();
    await expect(page).toHaveURL(/\/cuenta$/);

    await page.getByTestId("buyer-tab-register").click();
    await page.getByTestId("buyer-submit").click();
    await expect(page.getByTestId("buyer-form").getByRole("alert")).toHaveCount(3);
    await page.getByTestId("buyer-name").fill("Comprador E2E");
    await page.getByTestId("buyer-email").fill(email);
    await page.getByTestId("buyer-password").fill(PASSWORD);
    await page.getByTestId("buyer-submit").click();
    await expect(page.getByTestId("buyer-greeting")).toContainText("Comprador E2E");
    await expect(page.getByTestId("buyer-account").getByTestId("empty-state")).toBeVisible();

    await page.goto("/unidades/villa-6");
    const heart = page.getByTestId("sheet-favorite");
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("nav-account").click();
    await expect(page.getByTestId("favorites-grid").getByTestId("unit-row-V6")).toBeVisible();

    await page.getByTestId("buyer-logout").click();
    await expect(page.getByTestId("buyer-sign-in")).toBeVisible();
    await page.getByTestId("buyer-email").fill(email);
    await page.getByTestId("buyer-password").fill("contraseña-incorrecta");
    await page.getByTestId("buyer-submit").click();
    await expect(page.getByTestId("buyer-error")).toContainText("incorrectos");
    await page.getByTestId("buyer-password").fill(PASSWORD);
    await page.getByTestId("buyer-submit").click();

    const savedHeart = page.getByTestId("favorites-grid").getByTestId("favorite-V6");
    await expect(savedHeart).toHaveAttribute("aria-pressed", "true");
    await savedHeart.click();
    await page.reload();
    await expect(page.getByTestId("buyer-account").getByTestId("empty-state")).toBeVisible();
  });

  test("el modo kiosko oculta la cuenta y los favoritos @kiosk", async ({ page }) => {
    await page.goto("/unidades?kiosk=1");
    await expect(page.locator("html")).toHaveAttribute("data-kiosk", "true");
    await expect(page.getByTestId("unit-row-V6")).toBeVisible();
    await expect(page.getByTestId("nav-account")).toBeHidden();
    await expect(page.getByTestId("favorite-V6")).toBeHidden();
  });
});
