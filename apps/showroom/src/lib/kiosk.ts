export const KIOSK_STORAGE_KEY = "synapse-kiosk";
export const KIOSK_IDLE_MS = 90_000;
export const KIOSK_WARNING_SECONDS = 15;

/** `?kiosk=1` / `?kiosk=0` switch the mode and win over the value stored on the device. */
export function resolveKioskMode(search: string, stored: string | null): boolean {
  const param = new URLSearchParams(search).get("kiosk");
  if (param === "1") return true;
  if (param === "0") return false;
  return stored === "true";
}

export function readStoredKioskMode(): string | null {
  try {
    return window.localStorage.getItem(KIOSK_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeKioskMode(enabled: boolean) {
  try {
    window.localStorage.setItem(KIOSK_STORAGE_KEY, String(enabled));
  } catch {
    // Storage blocked: the mode still applies to this page load.
  }
}
