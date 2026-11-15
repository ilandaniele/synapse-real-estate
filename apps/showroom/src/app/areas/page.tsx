"use client";

import { EmptyState } from "@synapse/ui";
import { ManifestGate } from "@/components/ManifestGate";
import { POI_LABELS } from "@/lib/format";

export default function AreasPage() {
  return (
    <ManifestGate>
      {({ development, gallery, pointsOfInterest }) => {
        // Gallery items that are not tied to a unit are treated as common-area renders.
        const common = gallery.filter((g) => g.unitId === null).sort((a, b) => a.sortOrder - b.sortOrder);
        const nearby = pointsOfInterest.filter((p) => p.distanceText);

        return (
          <div className="mx-auto max-w-6xl px-4 py-12 lg:px-8">
            <h1 className="text-3xl font-semibold">Áreas comunes y entorno</h1>
            <p className="mt-3 max-w-3xl text-lg text-slate-700">{development.description}</p>

            <h2 className="mt-10 text-xl font-semibold">Espacios</h2>
            {common.length === 0 ? (
              <EmptyState title="Aún no hay imágenes de las áreas comunes" description="Vuelve pronto: estamos preparando el material." />
            ) : (
              <ul className="mt-4 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3" data-testid="areas-list">
                {common.map((g) => (
                  <li key={g.id} className="overflow-hidden rounded-xl bg-white shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.imageUrl} alt={g.title} loading="lazy" className="aspect-[16/10] w-full object-cover" />
                    <div className="p-4">
                      <h3 className="font-semibold">{g.title}</h3>
                      <p className="mt-1 text-xs text-slate-600">{g.credit}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {nearby.length > 0 ? (
              <>
                <h2 className="mt-12 text-xl font-semibold">A pocos minutos</h2>
                <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {nearby.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                      <span>
                        <span className="block font-medium">{p.name}</span>
                        <span className="text-xs text-slate-600">{POI_LABELS[p.category]}</span>
                      </span>
                      <span className="text-sm text-slate-700">{p.distanceText}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        );
      }}
    </ManifestGate>
  );
}
