import { describe, expect, it } from "vitest";
import { BuyerRequestError, buyerErrorKey, toggledFavoriteIds } from "./buyer-state";

describe("buyerErrorKey", () => {
  it.each([
    [new BuyerRequestError("offline"), "password", "offline"],
    [new BuyerRequestError("TOO_MANY", 429), "password", "tooMany"],
    [new BuyerRequestError("EMAIL_UNAVAILABLE", 409), "password", "emailTaken"],
    [new BuyerRequestError("UNAUTHORIZED", 401), "password", "invalidCredentials"],
    [new BuyerRequestError("UNAUTHORIZED", 401), "google", "google"],
    [new BuyerRequestError("INTERNAL", 500), "password", "failed"],
    [new Error("boom"), "password", "failed"],
  ] as const)("maps %o via %s to %s", (error, via, key) => {
    expect(buyerErrorKey(error, via)).toBe(key);
  });
});

describe("toggledFavoriteIds", () => {
  it("puts a newly saved unit first without duplicating it", () => {
    expect(toggledFavoriteIds(["a", "b"], "c", true)).toEqual(["c", "a", "b"]);
    expect(toggledFavoriteIds(["a", "b"], "b", true)).toEqual(["b", "a"]);
  });

  it("removes an unsaved unit and ignores one that was not saved", () => {
    expect(toggledFavoriteIds(["a", "b"], "a", false)).toEqual(["b"]);
    expect(toggledFavoriteIds(["a"], "z", false)).toEqual(["a"]);
  });
});
