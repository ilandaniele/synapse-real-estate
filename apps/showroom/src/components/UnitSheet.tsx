"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import type { DevelopmentManifest } from "@synapse/contracts";
import { EmptyState, Price, StatusBadge } from "@synapse/ui";
import { formatArea } from "@/lib/format";
import { sortUnits, unitHasTour } from "@/lib/manifest";
import { useShowroomStore } from "@/lib/store";
import { LeadForm } from "./LeadForm";
import { ManifestGate } from "./ManifestGate";
import { BTN_PRIMARY } from "./UnitCard";

function UnitSheet({ manifest, slug }: { manifest: DevelopmentManifest; slug: string }) {
  const { development, units, scenes, gallery } = manifest;
  const unit = units.find((u) => u.slug === slug);
  const selectUnit = useShowroomStore((s) => s.selectUnit);

  // Coming from the sheet, "back to the masterplan" should keep this unit selected.
  useEffect(() => {
    if (unit) selectUnit(unit.code);
  }, [unit, selectUnit]);

  if (!unit) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          title="No encontramos esta unidad"
          description="Puede que ya no esté publicada."
          action={
            <Link href="/unidades" className="inline-flex min-h-11 items-center rounded-md border border-slate-400 px-4 text-sm">
              Ver todas las unidades
            </Link>
          }
        />
      </div>
    );
  }

  const ownGallery = gallery.filter((g) => g.unitId === unit.id);
  const thumbs = (ownGallery.length > 0 ? ownGallery : gallery).slice(0, 6);
  const hasTour = unitHasTour(scenes, unit.id);
  const others = sortUnits(units).filter((u) => u.id !== unit.id);

  const specs: [string, string][] = [
    ["Tipología", unit.unitType],
    ["Sector", unit.sector],
    ["Superficie interior", formatArea(unit.interiorArea)],
    ["Parcela", formatArea(unit.plotArea)],
    ["Terraza", formatArea(unit.terraceArea)],
    ["Dormitorios", String(unit.bedrooms)],
    ["Baños", String(unit.bathrooms)],
    ["Plantas", String(unit.floors)],
    ["Orientación", unit.orientation ?? "—"],
  ];

  return (
    <article data-testid="unit-sheet" data-unit-code={unit.code} className="mx-auto max-w-6xl px-4 py-10 lg:px-8">
      <Link href="/unidades" className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-700 hover:underline">
        <ArrowLeft aria-hidden="true" size={16} /> Todas las unidades
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
          <StatusBadge status={unit.status} />
          <Price amount={unit.price} currency={unit.currency} className="text-3xl font-semibold text-[#8a6a22]" />
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
                Tour 360
              </Link>
            ) : null}
            <Link
              href="/masterplan"
              className="inline-flex min-h-11 items-center rounded-md border border-slate-400 px-6 text-sm font-semibold hover:bg-slate-100"
            >
              Ver en el masterplan
            </Link>
          </div>

          {thumbs.length > 0 ? (
            <section className="mt-10" aria-labelledby="sheet-gallery">
              <h2 id="sheet-gallery" className="text-xl font-semibold">
                Galería
              </h2>
              <ul className="mt-3 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3" data-testid="sheet-gallery">
                {thumbs.map((g) => (
                  <li key={g.id}>
                    <a href={g.imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={g.imageUrl}
                        alt={`${g.title} (se abre en una pestaña nueva)`}
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
            Solicitar información sobre {unit.name}
          </h2>
          <p className="mb-5 mt-1 text-sm text-slate-600">Te enviaremos disponibilidad, planos y condiciones.</p>
          <LeadForm developmentSlug={development.slug} units={others.length ? [unit, ...others] : [unit]} unitId={unit.id} />
        </aside>
      </div>

      <p className="mt-10 text-xs text-slate-500">
        Última actualización: {new Date(unit.updatedAt).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" })}
      </p>
    </article>
  );
}

export function UnitSheetRoute({ slug }: { slug: string }) {
  return <ManifestGate>{(manifest) => <UnitSheet manifest={manifest} slug={slug} />}</ManifestGate>;
}
