"use client";

import { Search } from "lucide-react";
import { UNIT_STATUSES, STATUS_META } from "@synapse/domain";
import { useShowroomStore } from "@/lib/store";

const FIELD =
  "min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500";

/** Search + status / bedrooms / max price. Values live in the persisted store. */
export function UnitFilters({ currency = "EUR", dark = false }: { currency?: string; dark?: boolean }) {
  const filters = useShowroomStore((s) => s.filters);
  const setFilter = useShowroomStore((s) => s.setFilter);
  const labelCls = `mb-1 block text-xs font-medium ${dark ? "text-white/70" : "text-slate-600"}`;

  return (
    <form className="grid grid-cols-2 gap-3" role="search" aria-label="Filtrar unidades" onSubmit={(e) => e.preventDefault()}>
      <div className="col-span-2">
        <label htmlFor="f-search" className={labelCls}>
          Buscar unidades
        </label>
        <div className="relative">
          <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            id="f-search"
            type="search"
            data-testid="search-input"
            className={`${FIELD} pl-9`}
            placeholder="Villa 6, V3…"
            autoComplete="off"
            value={filters.query}
            onChange={(e) => setFilter("query", e.target.value)}
          />
        </div>
      </div>
      <div>
        <label htmlFor="f-status" className={labelCls}>
          Estado
        </label>
        <select
          id="f-status"
          data-testid="filter-status"
          className={FIELD}
          value={filters.status}
          onChange={(e) => setFilter("status", e.target.value as typeof filters.status)}
        >
          <option value="">Todos</option>
          {UNIT_STATUSES.filter((s) => s !== "UNLISTED").map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-beds" className={labelCls}>
          Dormitorios (mín.)
        </label>
        <select
          id="f-beds"
          data-testid="filter-bedrooms"
          className={FIELD}
          value={filters.minBedrooms}
          onChange={(e) => setFilter("minBedrooms", e.target.value)}
        >
          <option value="">Cualquiera</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n}+
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-2">
        <label htmlFor="f-price" className={labelCls}>
          Precio máximo ({currency})
        </label>
        <input
          id="f-price"
          type="number"
          inputMode="numeric"
          min={0}
          step={10000}
          data-testid="filter-price"
          className={FIELD}
          placeholder="Sin límite"
          value={filters.maxPrice}
          onChange={(e) => setFilter("maxPrice", e.target.value)}
        />
      </div>
    </form>
  );
}
