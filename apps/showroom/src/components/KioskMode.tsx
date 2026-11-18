"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { KIOSK_IDLE_MS, KIOSK_WARNING_SECONDS, readStoredKioskMode, resolveKioskMode, storeKioskMode } from "@/lib/kiosk";
import { useShowroomStore } from "@/lib/store";
import { useIdleTimeout } from "@/lib/useIdleTimeout";
import { KioskIdleWarning } from "./KioskIdleWarning";

function requestFullscreen() {
  if (document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement.requestFullscreen().catch(() => undefined);
}

function blockContextMenu(e: Event) {
  e.preventDefault();
}

/** Touch-screen kiosk: fullscreen, no long-press menu, and an idle reset back to the home page. */
export function KioskMode() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    const mode = resolveKioskMode(window.location.search, readStoredKioskMode());
    storeKioskMode(mode);
    setEnabled(mode);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.dataset.kiosk = "true";
    window.addEventListener("contextmenu", blockContextMenu);
    window.addEventListener("pointerdown", requestFullscreen);
    return () => {
      delete root.dataset.kiosk;
      window.removeEventListener("contextmenu", blockContextMenu);
      window.removeEventListener("pointerdown", requestFullscreen);
    };
  }, [enabled]);

  useIdleTimeout(enabled && secondsLeft === null, KIOSK_IDLE_MS, () => setSecondsLeft(KIOSK_WARNING_SECONDS));

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft === 0) {
      const store = useShowroomStore.getState();
      store.selectUnit(null);
      store.resetFilters();
      setSecondsLeft(null);
      router.push("/");
      window.scrollTo(0, 0);
      return;
    }
    const tick = window.setTimeout(() => setSecondsLeft(secondsLeft - 1), 1_000);
    return () => window.clearTimeout(tick);
  }, [secondsLeft, router]);

  if (secondsLeft === null || secondsLeft === 0) return null;
  return <KioskIdleWarning secondsLeft={secondsLeft} onContinue={() => setSecondsLeft(null)} />;
}
