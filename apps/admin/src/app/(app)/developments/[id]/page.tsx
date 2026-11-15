"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDevelopment } from "@/lib/queries";
import { DatosTab } from "@/components/dev/DatosTab";
import { FloorPlanTab } from "@/components/dev/FloorPlanTab";
import { PublishTab } from "@/components/dev/PublishTab";
import { ScenesTab } from "@/components/dev/ScenesTab";
import { UnitsTab } from "@/components/dev/UnitsTab";
import { PageHeader, QueryBoundary } from "@/components/ui";

const TABS = [
  { name: "datos", label: "Datos" },
  { name: "unidades", label: "Unidades" },
  { name: "escenas", label: "Escenas" },
  { name: "plano", label: "Plano" },
  { name: "publicar", label: "Publicar" },
] as const;
type TabName = (typeof TABS)[number]["name"];

export default function DevelopmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const development = useDevelopment(id);
  const [tab, setTab] = useState<TabName>("datos");
  const tabRefs = useRef(new Map<TabName, HTMLButtonElement>());

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((t) => t.name === tab);
    const next = e.key === "ArrowRight" ? index + 1 : e.key === "ArrowLeft" ? index - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const target = TABS[(next + TABS.length) % TABS.length];
    if (!target) return;
    setTab(target.name);
    tabRefs.current.get(target.name)?.focus();
  };

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/developments" className="text-blue-700 underline">
          ← Desarrollos
        </Link>
      </p>
      <QueryBoundary query={development}>
        {(dev) => (
          <>
            <PageHeader title={dev.name} description={`${dev.city} · ${dev.slug}`} />
            <div role="tablist" aria-label="Secciones del desarrollo" onKeyDown={onKeyDown} className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
              {TABS.map((t) => (
                <button
                  key={t.name}
                  ref={(el) => {
                    if (el) tabRefs.current.set(t.name, el);
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${t.name}`}
                  aria-selected={tab === t.name}
                  aria-controls={`panel-${t.name}`}
                  tabIndex={tab === t.name ? 0 : -1}
                  data-testid={`tab-${t.name}`}
                  onClick={() => setTab(t.name)}
                  className={`-mb-px min-h-10 border-b-2 px-4 py-2 text-sm font-medium ${tab === t.name ? "border-blue-600 text-blue-800" : "border-transparent text-gray-700 hover:text-gray-900"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} data-testid={`panel-${tab}`}>
              {tab === "datos" ? <DatosTab development={dev} /> : null}
              {tab === "unidades" ? <UnitsTab developmentId={dev.id} currency={dev.currency} /> : null}
              {tab === "escenas" ? <ScenesTab developmentId={dev.id} /> : null}
              {tab === "plano" ? <FloorPlanTab developmentId={dev.id} /> : null}
              {tab === "publicar" ? <PublishTab developmentId={dev.id} /> : null}
            </div>
          </>
        )}
      </QueryBoundary>
    </>
  );
}
