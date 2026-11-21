import type { Messages } from "@/i18n/messages";

/** API error code (or "offline" / "unknown") from a buyer request. */
export class BuyerRequestError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
  ) {
    super(code);
  }
}

export type BuyerErrorKey = keyof Messages["account"]["errors"];

/** The message to show for a failed sign-in, registration or Google sign-in. */
export function buyerErrorKey(error: unknown, via: "password" | "google"): BuyerErrorKey {
  if (!(error instanceof BuyerRequestError)) return "failed";
  if (error.code === "offline") return "offline";
  if (error.status === 429) return "tooMany";
  if (error.status === 409) return "emailTaken";
  if (error.status === 401) return via === "google" ? "google" : "invalidCredentials";
  return "failed";
}

export function toggledFavoriteIds(ids: readonly string[], unitId: string, saved: boolean): string[] {
  const others = ids.filter((id) => id !== unitId);
  return saved ? [unitId, ...others] : others;
}
