import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { mediaUrl, toStoredPath } from "../src/lib/storage";
import { DEFAULT_SEED_PASSWORD, PRODUCTION_OPT_IN, seedPassword } from "../src/seed/guard";

const quiet = () => {};

describe("relative public API URL", () => {
  const config = loadConfig({ PUBLIC_API_URL: "" }, quiet);

  it("accepts an empty PUBLIC_API_URL", () => {
    expect(config.publicApiUrl).toBe("");
  });

  it("builds same-origin media URLs and reads them back", () => {
    expect(mediaUrl(config, "demo/hero.jpg")).toBe("/media/demo/hero.jpg");
    expect(toStoredPath(config, "/media/demo/hero.jpg")).toBe("demo/hero.jpg");
  });

  it("still rejects a non-URL value", () => {
    expect(() => loadConfig({ PUBLIC_API_URL: "not a url" }, quiet)).toThrow(/PUBLIC_API_URL/);
  });
});

describe("MEDIA_PUBLIC_URL", () => {
  const config = loadConfig({ PUBLIC_API_URL: "https://api.example.test", MEDIA_PUBLIC_URL: "https://cdn.example.test/" }, quiet);

  it("builds media URLs on the CDN and reads them back", () => {
    expect(mediaUrl(config, "published/org/a.jpg")).toBe("https://cdn.example.test/published/org/a.jpg");
    expect(toStoredPath(config, "https://cdn.example.test/published/org/a.jpg")).toBe("published/org/a.jpg");
  });

  it("defaults to the API's /media", () => {
    expect(loadConfig({ PUBLIC_API_URL: "https://api.example.test" }, quiet).mediaBaseUrl).toBe("https://api.example.test/media");
  });
});

describe("seed guard", () => {
  const strong = "a-long-random-seed-password";

  it("uses the demo password outside production", () => {
    expect(seedPassword({ NODE_ENV: "development" })).toBe(DEFAULT_SEED_PASSWORD);
  });

  it("refuses production without the opt-in", () => {
    expect(() => seedPassword({ NODE_ENV: "production", SEED_PASSWORD: strong })).toThrow(/SEED_ALLOW_PRODUCTION/);
  });

  it("refuses production with a weak or default password", () => {
    const base = { NODE_ENV: "production", SEED_ALLOW_PRODUCTION: PRODUCTION_OPT_IN };
    expect(() => seedPassword({ ...base, SEED_PASSWORD: "short" })).toThrow(/SEED_PASSWORD/);
    expect(() => seedPassword({ ...base, SEED_PASSWORD: DEFAULT_SEED_PASSWORD })).toThrow(/SEED_PASSWORD/);
    expect(() => seedPassword(base)).toThrow(/SEED_PASSWORD/);
  });

  it("allows production with the opt-in and a strong password", () => {
    expect(seedPassword({ NODE_ENV: "production", SEED_ALLOW_PRODUCTION: PRODUCTION_OPT_IN, SEED_PASSWORD: strong })).toBe(strong);
  });
});

describe("email links", () => {
  const prod = { NODE_ENV: "production", SESSION_SECRET: "x".repeat(40), PUBLIC_API_URL: "" };

  it("defaults to the local admin outside production", () => {
    expect(loadConfig({ PUBLIC_API_URL: "" }, quiet).adminPublicUrl).toBe("http://localhost:3001");
  });

  it("requires ADMIN_PUBLIC_URL in production when SMTP is configured", () => {
    expect(() => loadConfig({ ...prod, SMTP_URL: "smtps://mail.example.test:465" }, quiet)).toThrow(/ADMIN_PUBLIC_URL/);
    const config = loadConfig({ ...prod, SMTP_URL: "smtps://mail.example.test:465", ADMIN_PUBLIC_URL: "https://admin.example.test/" }, quiet);
    expect(config.adminPublicUrl).toBe("https://admin.example.test");
  });

  it("rejects a non-SMTP URL", () => {
    expect(() => loadConfig({ PUBLIC_API_URL: "", SMTP_URL: "http://mail.example.test" }, quiet)).toThrow(/SMTP_URL/);
  });
});

describe("LOGIN_RATE_LIMIT", () => {
  it("defaults to 10 per minute and rejects values out of range", () => {
    expect(loadConfig({}, quiet).loginRateLimit).toBe(10);
    expect(loadConfig({ LOGIN_RATE_LIMIT: "60" }, quiet).loginRateLimit).toBe(60);
    expect(() => loadConfig({ LOGIN_RATE_LIMIT: "0" }, quiet)).toThrow(/LOGIN_RATE_LIMIT/);
  });
});
