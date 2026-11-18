import { describe, expect, it } from "vitest";
import { allowsTracking } from "./analytics";

describe("allowsTracking", () => {
  it("counts visitors without privacy signals", () => {
    expect(allowsTracking({})).toBe(true);
    expect(allowsTracking({ doNotTrack: "0", globalPrivacyControl: false })).toBe(true);
  });

  it("respects Do Not Track and Global Privacy Control", () => {
    expect(allowsTracking({ doNotTrack: "1" })).toBe(false);
    expect(allowsTracking({ globalPrivacyControl: true })).toBe(false);
  });
});
