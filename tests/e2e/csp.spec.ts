import { expect, test } from "@playwright/test";
import { waitForMasterplan, waitForPanorama } from "./helpers";

test("las páginas 3D y 360 no violan la CSP de producción", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (/Content Security Policy/i.test(error.message)) violations.push(error.message);
  });

  await page.goto("/masterplan");
  await waitForMasterplan(page);
  await page.goto("/tour/villa-6");
  await waitForPanorama(page);
  await page.goto("/ubicacion");
  await page.waitForLoadState("networkidle");

  expect(violations).toEqual([]);
});
