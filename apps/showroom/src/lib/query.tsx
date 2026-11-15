"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { DevelopmentManifest } from "@synapse/contracts";
import { fetchManifest } from "./manifest";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Republished manifests show up on focus and every 30 s (the API caches for 30 s). */
export function useManifest() {
  return useQuery<DevelopmentManifest, Error>({
    queryKey: ["manifest"],
    queryFn: ({ signal }) => fetchManifest(signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
