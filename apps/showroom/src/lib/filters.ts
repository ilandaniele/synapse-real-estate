import { filterUnits, isValidDecimalAmount, type UnitFilter } from "@synapse/domain";
import type { Unit } from "@synapse/contracts";
import type { FilterState } from "./store";

export function toUnitFilter(f: FilterState): UnitFilter {
  const filter: UnitFilter = {};
  if (f.query.trim()) filter.query = f.query;
  if (f.status) filter.statuses = [f.status];
  if (/^\d+$/.test(f.minBedrooms)) filter.minBedrooms = Number(f.minBedrooms);
  if (isValidDecimalAmount(f.maxPrice.trim())) filter.maxPrice = f.maxPrice.trim();
  return filter;
}

export function hasActiveFilters(f: FilterState): boolean {
  return Object.keys(toUnitFilter(f)).length > 0;
}

export function applyFilters(units: readonly Unit[], f: FilterState): Unit[] {
  return filterUnits(units, toUnitFilter(f));
}
