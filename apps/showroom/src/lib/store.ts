"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { UnitStatus } from "@synapse/domain";

export interface FilterState {
  query: string;
  status: "" | UnitStatus;
  /** Minimum bedrooms as a digit string; empty = any. */
  minBedrooms: string;
  /** Maximum price as a decimal string; empty = any. */
  maxPrice: string;
}

export const EMPTY_FILTERS: FilterState = { query: "", status: "", minBedrooms: "", maxPrice: "" };

interface ShowroomState {
  selectedUnitCode: string | null;
  filters: FilterState;
  selectUnit: (code: string | null) => void;
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  resetFilters: () => void;
}

/** Selection + filters survive masterplan -> sheet -> tour -> back within the browser tab. */
export const useShowroomStore = create<ShowroomState>()(
  persist(
    (set) => ({
      selectedUnitCode: null,
      filters: EMPTY_FILTERS,
      selectUnit: (code) => set({ selectedUnitCode: code }),
      setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
      resetFilters: () => set({ filters: EMPTY_FILTERS }),
    }),
    {
      name: "synapse-showroom",
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ selectedUnitCode: s.selectedUnitCode, filters: s.filters }),
    },
  ),
);
