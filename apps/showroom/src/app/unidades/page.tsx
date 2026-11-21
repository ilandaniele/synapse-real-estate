"use client";

import { useMemo } from "react";
import { EmptyState } from "@synapse/ui";
import { ManifestGate } from "@/components/ManifestGate";
import { UnitFilters } from "@/components/UnitFilters";
import { UnitTile } from "@/components/UnitTile";
import { useI18n } from "@/i18n/I18nProvider";
import { applyFilters } from "@/lib/filters";
import { sortUnits, unitHasTour } from "@/lib/manifest";
import { useShowroomStore } from "@/lib/store";
import type { DevelopmentManifest } from "@synapse/contracts";

function UnitsGrid({ manifest }: { manifest: DevelopmentManifest }) {
  const filters = useShowroomStore((s) => s.filters);
  const resetFilters = useShowroomStore((s) => s.resetFilters);
  const { t } = useI18n();
  const units = useMemo(() => sortUnits(manifest.units), [manifest.units]);
  const filtered = useMemo(() => applyFilters(units, filters), [units, filters]);

  if (units.length === 0) {
    return <EmptyState title={t.units.emptyTitle} description={t.common.comeBackSoon} />;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
      <div className="self-start rounded-xl bg-white p-4 shadow-sm">
        <UnitFilters currency={manifest.development.currency} />
        <p aria-live="polite" className="mt-3 text-sm text-slate-600" data-testid="unit-count">
          {t.common.unitCount(filtered.length, units.length)}
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={t.units.noMatch}
          action={
            <button type="button" onClick={resetFilters} className="inline-flex min-h-11 items-center rounded-md border border-slate-400 px-4 text-sm">
              {t.common.clearFilters}
            </button>
          }
        />
      ) : (
        <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 xl:grid-cols-3" data-testid="units-grid">
          {filtered.map((u) => (
            <UnitTile key={u.id} unit={u} hasTour={unitHasTour(manifest.scenes, u.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function UnitsPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-12 lg:px-8">
      <h1 className="mb-8 text-3xl font-semibold">{t.units.title}</h1>
      <ManifestGate>{(manifest) => <UnitsGrid manifest={manifest} />}</ManifestGate>
    </div>
  );
}
