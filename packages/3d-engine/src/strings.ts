import type { Locale } from "@synapse/domain";

export interface MasterplanStrings {
  loading: (percent: number) => string;
  loadError: string;
  retry: string;
  noWebGL: string;
  unitList: string;
}

export const MASTERPLAN_STRINGS: Record<Locale, MasterplanStrings> = {
  es: {
    loading: (percent) => `Cargando masterplan ${percent}%`,
    loadError: "No se pudo cargar el masterplan",
    retry: "Reintentar",
    noWebGL: "Tu navegador no admite WebGL. Elige una unidad de la lista:",
    unitList: "Unidades del masterplan",
  },
  en: {
    loading: (percent) => `Loading masterplan ${percent}%`,
    loadError: "The masterplan could not be loaded",
    retry: "Try again",
    noWebGL: "Your browser does not support WebGL. Choose a unit from the list:",
    unitList: "Masterplan units",
  },
};
