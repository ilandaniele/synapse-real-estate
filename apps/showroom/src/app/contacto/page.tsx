"use client";

import { LeadForm } from "@/components/LeadForm";
import { ManifestGate } from "@/components/ManifestGate";
import { sortUnits } from "@/lib/manifest";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <h1 className="text-3xl font-semibold">Contacto</h1>
      <ManifestGate>
        {({ development, units }) => (
          <>
            <p className="mb-8 mt-2 text-slate-700">
              Cuéntanos qué buscas en {development.name} y un asesor te responderá.
            </p>
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <LeadForm developmentSlug={development.slug} units={sortUnits(units)} />
            </div>
          </>
        )}
      </ManifestGate>
    </div>
  );
}
