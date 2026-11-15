export const UNIT_STATUSES = ["AVAILABLE", "RESERVED", "SOLD", "UNLISTED"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export interface StatusMeta {
  label: string;
  color: string;
}

export const STATUS_META: Record<UnitStatus, StatusMeta> = {
  AVAILABLE: { label: "Disponible", color: "#3fae6a" },
  RESERVED: { label: "Reservada", color: "#e0a526" },
  SOLD: { label: "Vendida", color: "#d0473f" },
  UNLISTED: { label: "No publicada", color: "#8a8f98" },
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
