import { expect, test, type Page } from "@playwright/test";
import { ADMIN, adminLogin } from "./helpers";

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function openDevelopmentTab(page: Page, tab: string) {
  await page.goto(`${ADMIN}/developments`);
  await page.getByTestId("dev-row-lomas-del-faro").click();
  await page.getByTestId(`tab-${tab}`).click();
}

async function loginWith(page: Page, email: string, password: string) {
  await page.goto(`${ADMIN}/login`);
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe("Flujo E — contenidos, miembros y cuenta en el admin", () => {
  test("galería con imagen subida, punto de interés y lista de planos", async ({ page }) => {
    await adminLogin(page);
    await openDevelopmentTab(page, "galeria");
    await expect(page.getByTestId("gallery-row").first()).toBeVisible();
    const before = await page.getByTestId("gallery-row").count();
    await page.getByTestId("gallery-create-open").click();
    const gallery = page.getByTestId("gallery-form");
    await gallery.getByTestId("gallery-field-title").fill("Terraza E2E");
    await gallery.getByTestId("gallery-field-credit").fill("Render propio");
    await gallery.getByTestId("gallery-field-image").setInputFiles({ name: "terraza.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(gallery.getByTestId("gallery-field-image-preview")).toBeVisible();
    await gallery.getByTestId("gallery-save").click();
    await expect(page.getByTestId("gallery-dialog")).toHaveCount(0);
    await expect(page.getByTestId("gallery-row")).toHaveCount(before + 1);
    await expect(page.getByTestId("gallery-table")).toContainText("Terraza E2E");

    await page.getByTestId("tab-ubicacion").click();
    await page.getByTestId("poi-create-open").click();
    const poi = page.getByTestId("poi-form");
    await poi.getByTestId("poi-field-name").fill("Club de pádel");
    await poi.getByTestId("poi-field-lat").fill("200");
    await poi.getByTestId("poi-field-lng").fill("-4.88");
    await poi.getByTestId("poi-save").click();
    await expect(poi.getByTestId("poi-field-lat")).toHaveAttribute("aria-invalid", "true");
    await poi.getByTestId("poi-field-lat").fill("36.51");
    await poi.getByTestId("poi-save").click();
    await expect(page.getByTestId("poi-table")).toContainText("Club de pádel");

    await page.getByTestId("tab-plano").click();
    await expect(page.getByTestId("floorplan-row").first()).toBeVisible();
    await expect(page.getByTestId("plan-editor")).toBeVisible();
  });

  test("propietario crea un miembro que cambia su contraseña y no ve Miembros", async ({ page }) => {
    const email = `e2e-${Date.now()}@synapse.local`;
    const initial = "initial-password-123";
    const rotated = "rotated-password-456";

    await adminLogin(page);
    await page.getByTestId("nav-members").click();
    await expect(page.getByTestId("member-table")).toContainText("owner@synapse.local");
    await page.getByTestId("member-create-open").click();
    const form = page.getByTestId("member-form");
    await form.getByTestId("member-field-email").fill(email);
    await form.getByTestId("member-field-name").fill("Visitante E2E");
    await form.getByTestId("member-field-role").selectOption("VIEWER");
    await form.getByTestId("member-field-password").fill(initial);
    await form.getByTestId("member-save").click();
    await expect(page.getByTestId("member-table")).toContainText(email);
    await page.getByTestId("logout").click();

    await loginWith(page, email, initial);
    await expect(page.getByTestId("nav-members")).toHaveCount(0);
    await page.getByTestId("nav-account").click();
    await page.getByTestId("password-current").fill("not-the-password");
    await page.getByTestId("password-new").fill(rotated);
    await page.getByTestId("password-confirm").fill(rotated);
    await page.getByTestId("password-save").click();
    await expect(page.getByTestId("password-error")).toContainText("La contraseña actual no es correcta.");

    await page.getByTestId("password-current").fill(initial);
    await page.getByTestId("password-save").click();
    await expect(page.getByTestId("password-saved")).toBeVisible();
    await page.getByTestId("logout").click();
    await loginWith(page, email, rotated);
  });
});
