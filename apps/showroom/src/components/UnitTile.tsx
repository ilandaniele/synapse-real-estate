"use client";

import Link from "next/link";
import type { Unit } from "@synapse/contracts";
import { INTL_LOCALE } from "@synapse/domain";
import { Price, StatusBadge } from "@synapse/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { formatArea } from "@/lib/format";
import { useShowroomStore } from "@/lib/store";
import { FavoriteToggle } from "./FavoriteToggle";

export function UnitTile({ unit, hasTour }: { unit: Unit; hasTour: boolean }) {
  const selectUnit = useShowroomStore((s) => s.selectUnit);
  const { locale, t } = useI18n();
  return (
    <li data-testid={`unit-row-${unit.code}`} className="flex flex-col rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">{unit.code}</p>
          <h2 className="text-xl font-semibold">{unit.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={unit.status} locale={locale} />
          <FavoriteToggle unitId={unit.id} unitName={unit.name} testId={`favorite-${unit.code}`} />
        </div>
      </div>
      <Price amount={unit.price} currency={unit.currency} locale={INTL_LOCALE[locale]} className="mt-3 text-2xl font-semibold text-[#8a6a22]" />
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-slate-700">
        <dt>{t.specs.interior}</dt>
        <dd className="text-right">{formatArea(unit.interiorArea, locale)}</dd>
        <dt>{t.specs.plot}</dt>
        <dd className="text-right">{formatArea(unit.plotArea, locale)}</dd>
        <dt>{t.specs.bedrooms}</dt>
        <dd className="text-right">{unit.bedrooms}</dd>
        <dt>{t.specs.bathrooms}</dt>
        <dd className="text-right">{unit.bathrooms}</dd>
      </dl>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Link
          href={`/unidades/${unit.slug}`}
          data-testid={`unit-link-${unit.code}`}
          onClick={() => selectUnit(unit.code)}
          className="inline-flex min-h-11 items-center rounded-md bg-[#0b1220] px-4 text-sm font-semibold text-white hover:bg-[#1b2740]"
        >
          {t.common.viewSheet}
        </Link>
        {hasTour ? (
          <Link
            href={`/tour/${unit.slug}`}
            onClick={() => selectUnit(unit.code)}
            className="inline-flex min-h-11 items-center rounded-md border border-slate-400 px-4 text-sm font-semibold hover:bg-slate-100"
          >
            {t.common.tour360}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
