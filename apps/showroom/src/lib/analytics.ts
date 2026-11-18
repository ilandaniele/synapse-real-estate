import type { VisitEventInput } from "@synapse/contracts";
import { DEVELOPMENT_SLUG, VISITS_URL } from "./config";

interface PrivacySignals {
  doNotTrack?: string | null;
  globalPrivacyControl?: boolean;
}

/** Visitors who send Do Not Track or Global Privacy Control are not counted at all. */
export const allowsTracking = ({ doNotTrack, globalPrivacyControl }: PrivacySignals) => doNotTrack !== "1" && globalPrivacyControl !== true;

/** Fire-and-forget view counter; analytics must never break or slow the showroom. */
export function trackVisit(kind: VisitEventInput["kind"], targetId: string) {
  if (!allowsTracking(navigator as Navigator & PrivacySignals)) return;
  const event: VisitEventInput = { developmentSlug: DEVELOPMENT_SLUG, kind, targetId };
  void fetch(VISITS_URL, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  }).catch(() => undefined);
}
