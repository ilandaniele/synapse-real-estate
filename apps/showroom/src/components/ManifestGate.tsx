"use client";

import type { ReactNode } from "react";
import type { DevelopmentManifest } from "@synapse/contracts";
import { ErrorState, Spinner } from "@synapse/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { ManifestError } from "@/lib/manifest";
import { useManifest } from "@/lib/query";

/** Resolves the published manifest and renders loading / error (with retry) states around the page. */
export function ManifestGate({ children }: { children: (manifest: DevelopmentManifest) => ReactNode }) {
  const { data, error, isPending, refetch, isFetching } = useManifest();
  const { t } = useI18n();

  if (data) return <>{children(data)}</>;

  if (isPending || (isFetching && !error)) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-slate-600" data-testid="page-loading">
        <Spinner label={t.common.loading} />
        <p className="text-sm">{t.manifest.loading}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md items-center justify-center text-slate-800">
      <ErrorState message={error instanceof ManifestError ? t.manifest.errors[error.reason] : t.manifest.error} retryLabel={t.common.retry} onRetry={() => void refetch()} />
    </div>
  );
}
