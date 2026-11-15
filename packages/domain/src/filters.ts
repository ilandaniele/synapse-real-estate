import type { UnitStatus } from "./availability";
import { toMinorUnits } from "./money";

export interface FilterableUnit {
  code: string;
  name: string;
  status: UnitStatus;
  price: string;
  interiorArea: number;
  bedrooms: number;
  bathrooms: number;
  unitType: string;
  sector: string;
}

export interface UnitFilter {
  query?: string;
  statuses?: UnitStatus[];
  minPrice?: string;
  maxPrice?: string;
  minArea?: number;
  minBedrooms?: number;
  minBathrooms?: number;
  unitType?: string;
  sector?: string;
}

export function matchesFilter(unit: FilterableUnit, filter: UnitFilter): boolean {
  const query = filter.query?.trim().toLowerCase();
  if (query && !`${unit.code} ${unit.name}`.toLowerCase().includes(query)) return false;
  if (filter.statuses?.length && !filter.statuses.includes(unit.status)) return false;
  const price = toMinorUnits(unit.price);
  if (filter.minPrice && price < toMinorUnits(filter.minPrice)) return false;
  if (filter.maxPrice && price > toMinorUnits(filter.maxPrice)) return false;
  if (filter.minArea !== undefined && unit.interiorArea < filter.minArea) return false;
  if (filter.minBedrooms !== undefined && unit.bedrooms < filter.minBedrooms) return false;
  if (filter.minBathrooms !== undefined && unit.bathrooms < filter.minBathrooms) return false;
  if (filter.unitType && unit.unitType !== filter.unitType) return false;
  if (filter.sector && unit.sector !== filter.sector) return false;
  return true;
}

export function filterUnits<T extends FilterableUnit>(units: readonly T[], filter: UnitFilter): T[] {
  return units.filter((u) => matchesFilter(u, filter));
}
