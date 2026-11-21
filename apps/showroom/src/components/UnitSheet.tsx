"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import type { DevelopmentManifest } from "@synapse/contracts";
import { EmptyState, Price, StatusBadge } from "@synapse/ui";
import { INTL_LOCALE } from "@synapse/domain";
import { useI18n } from "@/i18n/I18nProvider";
import { formatArea } from "@/lib/format";
import { sortUnits, unitHasTour } from "@/lib/manifest";
import { trackVisit } from "@/lib/analytics";
import { useReservationSettings } from "@/lib/reservations";
import { useShowroomStore } from "@/lib/store";
import { FavoriteToggle } from "./FavoriteToggle";
import { LeadForm } from "./LeadForm";
import { ManifestGate } from "./ManifestGate";
import { BTN_PRIMARY } from "./UnitCard";

function UnitSheet({ manifest, slug }: { manifest: DevelopmentManifest; slug: string }) {
  const { development, units, scenes, gallery } = manifest;
  const unit = units.find((u) => u.slug === slug);
  const selectUnit = useShowroomStore((s) => s.selectUnit);
  const { locale, t } = useI18n();
  const reservations = useReservationSettings();

  // Coming from the sheet, "back to the masterplan" should keep this unit selected.
  useEffect(() => {
    if (unit) selectUnit(unit.code);
  }, [unit, selectUnit]);

  const unitId = unit?.id;
  useEffect(() => {
    if (unitId) trackVisit("UNIT", unitId);
  }, [unitId]);

  if (!unit) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          title={t.common.unitNotFound}
          description={t.sheet.notPublished}
          action={
            <Link href="/unidades" className="inline-flex min-h-11 items-center rounded-md border border-slate-400 px-4 text-sm">
              {t.sheet.allUnits}
            </Link>
          }
        />
      </div>
    );
  }

  const ownGallery = gallery.filter((g) => g.unitId === unit.id);
  const thumbs = (ownGallery.length > 0 ? ownGallery : gallery).slice(0, 6);
  const hasTour = unitHasTour(scenes, unit.id);
  const reservable = reservations.data?.enabled === true && unit.status === "AVAILABLE";
  const others = sortUnits(units).filter((u) => u.id !== unit.id);

  const specs: [string, string][] = [
    [t.specs.unitType, unit.unitType],
    [t.specs.sector, unit.sector],
    [t.specs.interiorArea, formatArea(unit.interiorArea, locale)],
    [t.specs.plot, formatArea(unit.plotArea, locale)],
    [t.specs.terrace, formatArea(unit.terraceArea, locale)],
    [t.specs.bedrooms, String(unit.bedrooms)],
    [t.specs.bathrooms, String(unit.bathrooms)],
    [t.specs.floors, String(unit.floors)],
    [t.specs.orientation, unit.orientation ?? "—"],
  ];

  return (
    <article data-testid="unit-sheet" data-unit-code={unit.code} className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
      <Link href="/unidades" className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-700 hover:underline">
        <ArrowLeft aria-hidden="true" size={16} /> {t.sheet.backToUnits}
      </Link>

      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-slate-500">
            {development.name} · {unit.code}
          </p>
          <h1 className="text-4xl font-semibold" data-testid="unit-sheet-name">
            {unit.name}
          </h1>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-2">
            <StatusBadge status={unit.status} locale={locale} />
            <FavoriteToggle unitId={unit.id} unitName={unit.name} testId="sheet-favorite" />
          </div>
          <Price amount={unit.price} currency={unit.currency} locale={INTL_LOCALE[locale]} className="text-3xl font-semibold text-[#8a6a22]" />
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="text-lg leading-relaxed text-slate-700">{unit.description}</p>

          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3">
            {specs.map(([k, v]) => (
              <div key={k} className="bg-white p-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">{k}</dt>
                <dd className="mt-1 font-medium">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            {hasTour ? (
              <Link href={`/tour/${unit.slug}`} data-testid="sheet-tour-link" className={`${BTN_PRIMARY} px-6`}>
                {t.common.tour360}
              </Link>
            ) : null}
            {reservable ? (
              <Link href={`/reservar/${unit.slug}`} data-testid="sheet-reserve-link" className={`${BTN_PRIMARY} px-6`}>
                {t.reservation.reserve}
              </Link>
            ) : null}
            <Link
              href="/masterplan"
              className="inline-flex min-h-11 items-center rounded-md border border-slate-400 px-6 text-sm font-semibold hover:bg-slate-100"
            >
              {t.sheet.onMasterplan}
            </Link>
          </div>

          {thumbs.length > 0 ? (
            <section className="mt-10" aria-labelledby="sheet-gallery">
              <h2 id="sheet-gallery" className="text-xl font-semibold">
                {t.sheet.gallery}
              </h2>
              <ul className="mt-3 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3" data-testid="sheet-gallery">
                {thumbs.map((g) => (
                  <li key={g.id}>
                    <a href={g.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={g.imageUrl}
                        alt={t.sheet.opensInNewTab(g.title)}
                        loading="lazy"
                        className="aspect-[16/10] w-full object-cover transition-transform hover:scale-105"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside id="solicitar" aria-labelledby="sheet-lead" className="self-start rounded-xl bg-white p-6 shadow-sm">
          <h2 id="sheet-lead" className="text-xl font-semibold">
            {t.sheet.requestInfo(unit.name)}
          </h2>
          <p className="mb-5 mt-1 text-sm text-slate-600">{t.sheet.requestInfoText}</p>
          <LeadForm developmentSlug={development.slug} units={others.length ? [unit, ...others] : [unit]} unitId={unit.id} />
        </aside>
      </div>

      <p className="mt-10 text-xs text-slate-500">
        {t.sheet.updatedAt} {new Date(unit.updatedAt).toLocaleString(INTL_LOCALE[locale], { dateStyle: "long", timeStyle: "short" })}
      </p>
    </article>
  );
}

export function UnitSheetRoute({ slug }: { slug: string }) {
  return <ManifestGate>{(manifest) => <UnitSheet manifest={manifest} slug={slug} />}</ManifestGate>;
}
