"use client";

import { ManifestGate } from "@/components/ManifestGate";
import { LocationView } from "@/components/LocationView";

export default function LocationPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-12 lg:px-8">
      <h1 className="text-3xl font-semibold">Ubicación</h1>
      <ManifestGate>
        {({ development, pointsOfInterest }) => (
          <>
            <p className="mb-8 mt-2 text-slate-700">
              {development.name} · {development.city}
            </p>
            <LocationView development={development} pois={pointsOfInterest} />
          </>
        )}
      </ManifestGate>
    </div>
  );
}
