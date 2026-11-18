"use client";

import { useEffect, useState } from "react";

/** Reads `#token=` once and clears it from the address bar so it is not kept in history. */
export function useHashToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    setToken((previous) => previous ?? value);
    if (value) window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return token;
}
