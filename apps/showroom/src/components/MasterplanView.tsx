"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { ListFilter, X } from "lucide-react";
import type { DevelopmentManifest } from "@synapse/contracts";
import { INTL_LOCALE, STATUS_LABELS, STATUS_META, type UnitStatus } from "@synapse/domain";
import { EmptyState, Price, Spinner } from "@synapse/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { applyFilters, hasActiveFilters } from "@/lib/filters";
import { sortUnits, unitHasTour } from "@/lib/manifest";
import { useShowroomStore } from "@/lib/store";
import { UnitCard } from "./UnitCard";
import { UnitFilters } from "./UnitFilters";

const Masterplan = dynamic(() => import("@synapse/3d-engine").then((m) => m.Masterplan), {
  ssr: false,
  loading: () => <ViewerLoading />,
});

function ViewerLoading() {
  const { t } = useI18n();
  return (
    <div className="flex h-full items-center justify-center text-slate-700">
      <Spinner label={t.masterplan.loadingViewer} />
    </div>
  );
}

const LEGEND: UnitStatus[] = ["AVAILABLE", "RESERVED", "SOLD"];

export function MasterplanView({ manifest }: { manifest: DevelopmentManifest }) {
  const { development, units: rawUnits, scenes } = manifest;
  const units = useMemo(() => sortUnits(rawUnits), [rawUnits]);
  const filters = useShowroomStore((s) => s.filters);
  const resetFilters = useShowroomStore((s) => s.resetFilters);
  const selectedCode = useShowroomStore((s) => s.selectedUnitCode);
  const selectUnit = useShowroomStore((s) => s.selectUnit);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const { locale, t } = useI18n();
  const labels = STATUS_LABELS[locale];

  const filtered = useMemo(() => applyFilters(units, filters), [units, filters]);
  const active = hasActiveFilters(filters);
  const matchingIds = useMemo(() => new Set(filtered.map((u) => u.id)), [filtered]);
  const filterMatch = useCallback((id: string) => matchingIds.has(id), [matchingIds]);

  const selected = useMemo(() => units.find((u) => u.code === selectedCode) ?? null, [units, selectedCode]);

  const onSelect = useCallback(
    (id: string | null) => selectUnit(units.find((u) => u.id === id)?.code ?? null),
    [units, selectUnit],
  );

  if (!development.modelUrl) {
    return (
      <div className="mx-auto max-w-md py-16">
        <EmptyState title={t.masterplan.unavailableTitle} description={t.masterplan.unavailableText} />
      </div>
    );
  }

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden bg-slate-300">
      <Masterplan
        className="absolute inset-0 h-full w-full"
        modelUrl={development.modelUrl}
        units={units}
        selectedUnitId={selected?.id ?? null}
        hoveredUnitId={hoveredId}
        onSelect={onSelect}
        onHover={setHoveredId}
        filterMatch={active ? filterMatch : undefined}
        locale={locale}
      />

      <ul
        aria-label={t.masterplan.legend}
        data-testid="status-legend"
        className="pointer-events-none absolute left-3 top-3 z-10 m-0 flex list-none flex-wrap gap-x-3 gap-y-1 rounded-lg bg-[#0b1220]/80 px-3 py-2 text-xs text-white backdrop-blur md:left-auto md:right-4 md:top-4"
      >
        {LEGEND.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: STATUS_META[s].color }} />
            {labels[s]}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        aria-expanded={panelOpen}
        aria-controls="masterplan-panel"
        data-testid="masterplan-panel-toggle"
        className="absolute bottom-3 left-3 z-20 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0b1220]/90 px-4 text-sm font-medium text-white shadow-lg backdrop-blur md:hidden"
      >
        {panelOpen ? <X aria-hidden="true" size={16} /> : <ListFilter aria-hidden="true" size={16} />}
        {panelOpen ? t.common.close : t.masterplan.openPanel}
      </button>

      <aside
        id="masterplan-panel"
        aria-label={t.masterplan.panel}
        className={`${
          panelOpen ? "flex" : "hidden md:flex"
        } absolute z-10 flex-col gap-3 overflow-hidden rounded-xl border border-white/15 bg-[#0b1220]/90 p-4 text-white shadow-2xl backdrop-blur max-md:inset-x-3 max-md:bottom-16 max-md:max-h-[70%] md:bottom-4 md:left-4 md:top-4 md:w-80`}
      >
        <h1 className="text-lg font-semibold">{development.name}</h1>
        <UnitFilters currency={development.currency} dark />
        <p aria-live="polite" className="text-xs text-white/70" data-testid="unit-count">
          {t.common.unitCount(filtered.length, units.length)}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <EmptyState
              title={t.masterplan.noMatch}
              description={t.masterplan.widenFilters}
              action={
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex min-h-11 items-center rounded-md border border-white/40 px-4 text-sm"
                >
                  {t.common.clearFilters}
                </button>
              }
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {filtered.map((u) => {
                const isSelected = u.code === selectedCode;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      data-testid={`unit-row-${u.code}`}
                      aria-pressed={isSelected}
                      onClick={() => {
                        selectUnit(u.code);
                        setPanelOpen(false);
                      }}
                      onMouseEnter={() => setHoveredId(u.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onFocus={() => setHoveredId(u.id)}
                      onBlur={() => setHoveredId(null)}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                        isSelected ? "border-[#d9b46a] bg-white/15" : "border-white/10 hover:bg-white/10"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="size-3 shrink-0 rounded-full"
                        style={{ background: STATUS_META[u.status].color }}
                      />
                      <span className="flex-1">
                        <span className="block font-medium">
                          {u.name} <span className="font-normal text-white/60">({u.code})</span>
                        </span>
                        <span className="block text-xs text-white/70">
                          {labels[u.status]} · {t.masterplan.bedroomsShort(u.bedrooms)}
                        </span>
                      </span>
                      <Price amount={u.price} currency={u.currency} locale={INTL_LOCALE[locale]} className="text-xs text-[#f0d79a]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {selected ? (
        <div className={`absolute inset-x-3 bottom-16 z-10 md:inset-x-auto md:bottom-4 md:right-4 md:w-96 ${panelOpen ? "max-md:hidden" : ""}`}>
          <UnitCard unit={selected} hasTour={unitHasTour(scenes, selected.id)} onClose={() => selectUnit(null)} />
        </div>
      ) : null}
    </div>
  );
}
