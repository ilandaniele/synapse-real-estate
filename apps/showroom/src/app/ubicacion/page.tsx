"use client";

import { ManifestGate } from "@/components/ManifestGate";
import { LocationView } from "@/components/LocationView";
import { useI18n } from "@/i18n/I18nProvider";

export default function LocationPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-12 lg:px-8">
      <h1 className="text-3xl font-semibold">{t.location.title}</h1>
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
