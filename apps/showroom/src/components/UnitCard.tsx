"use client";

import Link from "next/link";
import { X } from "lucide-react";
import type { Unit } from "@synapse/contracts";
import { Price, StatusBadge } from "@synapse/ui";
import { formatArea } from "@/lib/format";

export const BTN_PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-[#d9b46a] px-4 text-sm font-semibold text-[#0b1220] transition-colors hover:bg-[#e6c67f]";
export const BTN_SECONDARY =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-white/40 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/10";

/** Floating unit summary shown over the masterplan. */
export function UnitCard({ unit, hasTour, onClose }: { unit: Unit; hasTour: boolean; onClose: () => void }) {
  return (
    <section
      data-testid="unit-card"
      data-unit-code={unit.code}
      aria-label={`Resumen de ${unit.name}`}
      className="rounded-xl border border-white/15 bg-[#0b1220]/90 p-4 text-white shadow-2xl backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/60">Unidad {unit.code}</p>
          <h2 className="text-xl font-semibold">{unit.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar resumen de la unidad"
          data-testid="unit-card-close"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-white/20 hover:bg-white/10"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="inline-flex rounded-full bg-white">
          <StatusBadge status={unit.status} />
        </span>
        <Price amount={unit.price} currency={unit.currency} className="text-lg font-semibold text-[#f0d79a]" />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-white/60">Superficie interior</dt>
        <dd className="text-right">{formatArea(unit.interiorArea)}</dd>
        <dt className="text-white/60">Parcela</dt>
        <dd className="text-right">{formatArea(unit.plotArea)}</dd>
        <dt className="text-white/60">Dormitorios</dt>
        <dd className="text-right">{unit.bedrooms}</dd>
        <dt className="text-white/60">Baños</dt>
        <dd className="text-right">{unit.bathrooms}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/unidades/${unit.slug}`} data-testid="unit-card-sheet-link" className={BTN_PRIMARY}>
          Ver ficha
        </Link>
        {hasTour ? (
          <Link href={`/tour/${unit.slug}`} data-testid="unit-card-tour-link" className={BTN_SECONDARY}>
            Tour 360
          </Link>
        ) : null}
      </div>
    </section>
  );
}
