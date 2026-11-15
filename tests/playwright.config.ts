import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against an isolated PGlite database (.data/pglite-e2e) that is re-seeded on every run, so the
 * flows that create units and publish never touch the local development data.
 *
 * Prerequisites: `pnpm assets:generate` once, and `pnpm build` (showroom/admin are served with `next start`).
 * Port 4000 must be free (stop any dev API first): the API is always started by Playwright so it uses the
 * E2E database.
 */
const API = "http://localhost:4000";
const SHOWROOM = "http://localhost:3000";
const ADMIN = "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.03, animations: "disabled" } },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: SHOWROOM,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, grepInvert: /@touch/ },
    {
      name: "kiosk-1920",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
      grep: /@kiosk|@visual/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@touch|@visual/ },
  ],
  webServer: [
    {
      command: "pnpm --filter @synapse/api seed && pnpm --filter @synapse/api start",
      url: `${API}/health`,
      cwd: "..",
      env: { DATABASE_URL: "pglite://.data/pglite-e2e", SEED_PASSWORD: "e2e-password-123" },
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
    },
    {
      command: "pnpm --filter @synapse/showroom start",
      url: SHOWROOM,
      cwd: "..",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @synapse/admin start",
      url: `${ADMIN}/login`,
      cwd: "..",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});

export const URLS = { API, SHOWROOM, ADMIN };
