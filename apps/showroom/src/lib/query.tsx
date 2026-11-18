"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useCallback, useState, type ReactNode } from "react";
import type { DevelopmentManifest } from "@synapse/contracts";
import { useI18n } from "@/i18n/I18nProvider";
import { fetchManifest, localizeManifest } from "./manifest";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Republished manifests show up on focus and every 30 s (the API caches for 30 s). Text comes in the visitor's locale. */
export function useManifest() {
  const { locale } = useI18n();
  const select = useCallback((manifest: DevelopmentManifest) => localizeManifest(manifest, locale), [locale]);
  return useQuery<DevelopmentManifest, Error>({
    queryKey: ["manifest"],
    queryFn: ({ signal }) => fetchManifest(signal),
    select,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
