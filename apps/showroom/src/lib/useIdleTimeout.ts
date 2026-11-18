"use client";

import { useEffect, useRef } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "input", "wheel", "touchstart"] as const;

/** Calls `onIdle` after `timeoutMs` without user input; every input restarts the wait. */
export function useIdleTimeout(enabled: boolean, timeoutMs: number, onIdle: () => void) {
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer = 0;
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => onIdleRef.current(), timeoutMs);
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, restart, { capture: true, passive: true });
    restart();
    return () => {
      window.clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, restart, { capture: true });
    };
  }, [enabled, timeoutMs]);
}
