"use client";

import Link from "next/link";
import { useMemo } from "react";
import { EmptyState, Price, StatusBadge } from "@synapse/ui";
import { ManifestGate } from "@/components/ManifestGate";
import { UnitFilters } from "@/components/UnitFilters";
import { useI18n } from "@/i18n/I18nProvider";
import { applyFilters } from "@/lib/filters";
import { INTL_LOCALE } from "@synapse/domain";
import { formatArea } from "@/lib/format";
import { sortUnits, unitHasTour } from "@/lib/manifest";
import { useShowroomStore } from "@/lib/store";
import type { DevelopmentManifest } from "@synapse/contracts";

function UnitsGrid({ manifest }: { manifest: DevelopmentManifest }) {
  const filters = useShowroomStore((s) => s.filters);
  const resetFilters = useShowroomStore((s) => s.resetFilters);
  const selectUnit = useShowroomStore((s) => s.selectUnit);
  const { locale, t } = useI18n();
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
            <li key={u.id} data-testid={`unit-row-${u.code}`} className="flex flex-col rounded-xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-500">{u.code}</p>
                  <h2 className="text-xl font-semibold">{u.name}</h2>
                </div>
                <StatusBadge status={u.status} locale={locale} />
              </div>
              <Price amount={u.price} currency={u.currency} locale={INTL_LOCALE[locale]} className="mt-3 text-2xl font-semibold text-[#8a6a22]" />
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-slate-700">
                <dt>{t.specs.interior}</dt>
                <dd className="text-right">{formatArea(u.interiorArea, locale)}</dd>
                <dt>{t.specs.plot}</dt>
                <dd className="text-right">{formatArea(u.plotArea, locale)}</dd>
                <dt>{t.specs.bedrooms}</dt>
                <dd className="text-right">{u.bedrooms}</dd>
                <dt>{t.specs.bathrooms}</dt>
                <dd className="text-right">{u.bathrooms}</dd>
              </dl>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Link
                  href={`/unidades/${u.slug}`}
                  data-testid={`unit-link-${u.code}`}
                  onClick={() => selectUnit(u.code)}
                  className="inline-flex min-h-11 items-center rounded-md bg-[#0b1220] px-4 text-sm font-semibold text-white hover:bg-[#1b2740]"
                >
                  {t.common.viewSheet}
                </Link>
                {unitHasTour(manifest.scenes, u.id) ? (
                  <Link
                    href={`/tour/${u.slug}`}
                    onClick={() => selectUnit(u.code)}
                    className="inline-flex min-h-11 items-center rounded-md border border-slate-400 px-4 text-sm font-semibold hover:bg-slate-100"
                  >
                    {t.common.tour360}
                  </Link>
                ) : null}
              </div>
            </li>
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
