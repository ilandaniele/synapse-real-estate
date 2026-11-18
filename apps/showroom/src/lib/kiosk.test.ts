import { describe, expect, it } from "vitest";
import { resolveKioskMode } from "./kiosk";

describe("resolveKioskMode", () => {
  it("turns on with ?kiosk=1 regardless of the stored value", () => {
    expect(resolveKioskMode("?kiosk=1", null)).toBe(true);
    expect(resolveKioskMode("?kiosk=1", "false")).toBe(true);
  });

  it("turns off with ?kiosk=0 regardless of the stored value", () => {
    expect(resolveKioskMode("?kiosk=0", "true")).toBe(false);
  });

  it("falls back to the stored value without a valid parameter", () => {
    expect(resolveKioskMode("", "true")).toBe(true);
    expect(resolveKioskMode("?kiosk=yes", "true")).toBe(true);
    expect(resolveKioskMode("?scene=living", null)).toBe(false);
  });
});
