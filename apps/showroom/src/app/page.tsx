"use client";

import Link from "next/link";
import { ArrowRight, Map as MapIcon, MapPin, Building2 } from "lucide-react";
import { ManifestGate } from "@/components/ManifestGate";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/UnitCard";
import { sortUnits, unitHasTour } from "@/lib/manifest";

export default function HomePage() {
  return (
    <ManifestGate>
      {(manifest) => {
        const { development, units, scenes } = manifest;
        const available = units.filter((u) => u.status === "AVAILABLE").length;
        const tourUnit = sortUnits(units).find((u) => unitHasTour(scenes, u.id) && u.status === "AVAILABLE") ??
          sortUnits(units).find((u) => unitHasTour(scenes, u.id));

        return (
          <>
            <section
              aria-labelledby="hero-title"
              className="relative flex min-h-[calc(100dvh-3.5rem)] items-end overflow-hidden bg-[#0b1220] text-white"
              data-testid="home-hero"
            >
              {development.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={development.heroImageUrl}
                  alt={`Vista de ${development.name}`}
                  className="absolute inset-0 h-full w-full object-cover"
                  data-testid="hero-image"
                  fetchPriority="high"
                />
              ) : null}
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#0b1220] via-[#0b1220]/55 to-[#0b1220]/10" />
              <div className="relative mx-auto w-full max-w-[1920px] px-4 pb-12 pt-24 lg:px-8 lg:pb-20">
                <p className="text-sm uppercase tracking-[0.3em] text-[#f0d79a]">
                  {development.city}
                </p>
                <h1 id="hero-title" className="mt-2 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-7xl">
                  {development.name}
                </h1>
                <p className="mt-4 max-w-2xl text-lg text-white/85 sm:text-xl">{development.tagline}</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href="/masterplan" data-testid="home-cta-masterplan" className={`${BTN_PRIMARY} gap-2 px-6`}>
                    Explorar el masterplan <ArrowRight aria-hidden="true" size={16} />
                  </Link>
                  {tourUnit ? (
                    <Link href={`/tour/${tourUnit.slug}`} data-testid="home-cta-tour" className={`${BTN_SECONDARY} px-6`}>
                      Recorrer {tourUnit.name} en 360°
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-[1.4fr_1fr] lg:px-8">
              <div>
                <h2 className="text-2xl font-semibold">Sobre el desarrollo</h2>
                <p className="mt-3 text-lg leading-relaxed text-slate-700">{development.description}</p>
              </div>
              <dl className="grid grid-cols-2 gap-4 self-start">
                <div className="rounded-xl bg-white p-5 shadow-sm">
                  <dt className="text-sm text-slate-600">Viviendas publicadas</dt>
                  <dd className="mt-1 text-3xl font-semibold" data-testid="stat-units">{units.length}</dd>
                </div>
                <div className="rounded-xl bg-white p-5 shadow-sm">
                  <dt className="text-sm text-slate-600">Disponibles</dt>
                  <dd className="mt-1 text-3xl font-semibold text-emerald-700" data-testid="stat-available">{available}</dd>
                </div>
              </dl>
            </section>

            <section aria-label="Accesos rápidos" className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-3 lg:px-8">
              {[
                { href: "/masterplan", icon: MapIcon, title: "Masterplan 3D", text: "Elige tu villa sobre el plano interactivo." },
                { href: "/unidades", icon: Building2, title: "Unidades", text: "Compara precios, superficies y dormitorios." },
                { href: "/ubicacion", icon: MapPin, title: "Ubicación", text: "Descubre el entorno y los servicios cercanos." },
              ].map(({ href, icon: Icon, title, text }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex min-h-11 flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <Icon aria-hidden="true" size={22} className="text-[#a8802f]" />
                  <span className="text-lg font-semibold">{title}</span>
                  <span className="text-sm text-slate-600">{text}</span>
                </Link>
              ))}
            </section>
          </>
        );
      }}
    </ManifestGate>
  );
}
