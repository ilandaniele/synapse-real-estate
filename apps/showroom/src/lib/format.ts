import type { PointOfInterest } from "@synapse/contracts";

export const POI_LABELS: Record<PointOfInterest["category"], string> = {
  BEACH: "Playas",
  SCHOOL: "Colegios",
  HEALTH: "Salud",
  SHOPPING: "Compras",
  TRANSPORT: "Transporte",
  GOLF: "Golf",
  RESTAURANT: "Restauración",
};

export function formatArea(m2: number): string {
  return `${new Intl.NumberFormat("es-ES").format(m2)} m²`;
}
