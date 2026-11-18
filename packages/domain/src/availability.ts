import type { Locale } from "./locale";

export const UNIT_STATUSES = ["AVAILABLE", "RESERVED", "SOLD", "UNLISTED"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export interface StatusMeta {
  label: string;
  color: string;
}

export const STATUS_LABELS: Record<Locale, Record<UnitStatus, string>> = {
  es: { AVAILABLE: "Disponible", RESERVED: "Reservada", SOLD: "Vendida", UNLISTED: "No publicada" },
  en: { AVAILABLE: "Available", RESERVED: "Reserved", SOLD: "Sold", UNLISTED: "Unlisted" },
};

export const STATUS_META: Record<UnitStatus, StatusMeta> = {
  AVAILABLE: { label: STATUS_LABELS.es.AVAILABLE, color: "#3fae6a" },
  RESERVED: { label: STATUS_LABELS.es.RESERVED, color: "#e0a526" },
  SOLD: { label: STATUS_LABELS.es.SOLD, color: "#d0473f" },
  UNLISTED: { label: STATUS_LABELS.es.UNLISTED, color: "#8a8f98" },
};

const ALLOWED_TRANSITIONS: Record<UnitStatus, readonly UnitStatus[]> = {
  UNLISTED: ["AVAILABLE"],
  AVAILABLE: ["RESERVED", "SOLD", "UNLISTED"],
  RESERVED: ["AVAILABLE", "SOLD", "UNLISTED"],
  SOLD: ["AVAILABLE", "UNLISTED"],
};

export function canTransition(from: UnitStatus, to: UnitStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export function isPubliclyVisible(status: UnitStatus): boolean {
  return status !== "UNLISTED";
}
