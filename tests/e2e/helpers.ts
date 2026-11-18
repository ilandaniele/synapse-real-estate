import { expect, type Locator, type Page } from "@playwright/test";

export const API = "http://localhost:4000";
export const ADMIN = "http://localhost:3001";
export const E2E_PASSWORD = "e2e-password-123";

/** Waits until the 360 viewer settles (ready, or a documented fallback when WebGL is unavailable). */
export async function waitForPanorama(page: Page, sceneSlug?: string) {
  const viewer = page.getByTestId("panorama-viewer");
  await expect(viewer).toBeVisible();
  if (sceneSlug) await expect(viewer).toHaveAttribute("data-scene-slug", sceneSlug);
  await expect(viewer).toHaveAttribute("data-status", /ready|nowebgl/, { timeout: 30_000 });
  return viewer;
}

/** Waits until the masterplan canvas finished loading the GLB (or fell back to chips without WebGL). */
export async function waitForMasterplan(page: Page) {
  const canvas = page.getByTestId("masterplan-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId("masterplan-loading")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("masterplan-error")).toHaveCount(0);
  return canvas;
}

export async function adminLogin(page: Page, email = "owner@synapse.local") {
  await page.goto(`${ADMIN}/login`);
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(E2E_PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function isInViewport(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) return false;
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
}

/**
 * One-finger horizontal swipe over `target` through CDP touch events; `fraction` is relative to its width.
 * The finger rests before lifting so Chrome starts no fling, which would swallow the next tap's click.
 */
export async function swipe(page: Page, target: Locator, fraction: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error("swipe target has no box");
  const cdp = await page.context().newCDPSession(page);
  const y = box.y + box.height / 2;
  const startX = box.x + box.width / 2;
  const steps = 8;
  const point = (x: number) => [{ x, y }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(startX) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: point(startX + (box.width * fraction * i) / steps),
    });
  }
  const endX = startX + box.width * fraction;
  await page.waitForTimeout(300);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(endX) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/**
 * Two-finger pinch over `target` through CDP touch events: the fingers start `startGap` px apart on a horizontal
 * line at `yFraction` of its height and end `startGap * scale` px apart (scale > 1 zooms in).
 */
export async function pinch(page: Page, target: Locator, scale: number, { startGap = 80, yFraction = 0.5 } = {}) {
  const box = await target.boundingBox();
  if (!box) throw new Error("pinch target has no box");
  const cdp = await page.context().newCDPSession(page);
  const centerX = box.x + box.width / 2;
  const y = box.y + box.height * yFraction;
  const steps = 10;
  const fingers = (gap: number) => [
    { x: centerX - gap / 2, y, id: 0 },
    { x: centerX + gap / 2, y, id: 1 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: fingers(startGap) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: fingers(startGap * (1 + ((scale - 1) * i) / steps)),
    });
  }
  await page.waitForTimeout(300);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
