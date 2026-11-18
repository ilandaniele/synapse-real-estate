import { describe, expect, it } from "vitest";
import { resolveLocale } from "./resolve-locale";

describe("resolveLocale", () => {
  it("uses a valid cookie over the browser languages", () => {
    expect(resolveLocale("en", "es-ES,es;q=0.9")).toBe("en");
  });

  it("ignores an unsupported cookie value", () => {
    expect(resolveLocale("fr", "en-US,en;q=0.8")).toBe("en");
  });

  it("picks the highest-weighted supported language", () => {
    expect(resolveLocale(undefined, "fr-FR;q=0.9,en;q=0.5,es;q=0.7")).toBe("es");
    expect(resolveLocale(undefined, "de,en-GB;q=0.8")).toBe("en");
  });

  it("skips languages with q=0", () => {
    expect(resolveLocale(undefined, "en;q=0,es;q=0.1")).toBe("es");
  });

  it("falls back to Spanish", () => {
    expect(resolveLocale(undefined, null)).toBe("es");
    expect(resolveLocale(undefined, "fr,de")).toBe("es");
  });
});
