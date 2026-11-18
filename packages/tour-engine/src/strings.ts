import type { Locale } from "@synapse/domain";

export interface TourStrings {
  viewer: (sceneName: string) => string;
  loading: string;
  loadError: (sceneName: string) => string;
  retry: string;
  preview: (sceneName: string) => string;
  noWebGL: string;
  fallbackNav: string;
  goTo: (label: string) => string;
  info: (label: string) => string;
  planError: string;
  planAlt: (planName: string) => string;
  noScenes: string;
  planScenes: string;
  strip: string;
}

export const TOUR_STRINGS: Record<Locale, TourStrings> = {
  es: {
    viewer: (name) => `Panorama 360: ${name}`,
    loading: "Cargando panorama",
    loadError: (name) => `No se pudo cargar el panorama de «${name}».`,
    retry: "Reintentar",
    preview: (name) => `Vista previa de ${name}`,
    noWebGL: "Tu navegador no admite WebGL: se muestra una vista estática.",
    fallbackNav: "Navegación entre estancias",
    goTo: (label) => `Ir a ${label}`,
    info: (label) => `Información: ${label}`,
    planError: "No se pudo cargar el plano.",
    planAlt: (name) => `Plano: ${name}`,
    noScenes: "Sin estancias disponibles.",
    planScenes: "Estancias",
    strip: "Estancias del tour",
  },
  en: {
    viewer: (name) => `360° panorama: ${name}`,
    loading: "Loading panorama",
    loadError: (name) => `Could not load the panorama of “${name}”.`,
    retry: "Retry",
    preview: (name) => `Preview of ${name}`,
    noWebGL: "Your browser does not support WebGL: showing a static view.",
    fallbackNav: "Room navigation",
    goTo: (label) => `Go to ${label}`,
    info: (label) => `Information: ${label}`,
    planError: "Could not load the floor plan.",
    planAlt: (name) => `Floor plan: ${name}`,
    noScenes: "No rooms available.",
    planScenes: "Rooms",
    strip: "Tour rooms",
  },
};
