export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function slugifyText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const ROLE_LABELS = {
  OWNER: "Propietario",
  EDITOR: "Editor",
  SALES: "Ventas",
  VIEWER: "Lectura",
} as const;

export const JOB_STATUS_LABELS = {
  PENDING: "Pendiente",
  PROCESSING: "Procesando",
  REQUIRES_REVIEW: "Requiere revisión",
  COMPLETED: "Completado",
  FAILED: "Fallido",
} as const;

export const ASSET_STATUS_LABELS = {
  PENDING_UPLOAD: "Pendiente de subida",
  UPLOADED: "Subido",
  REJECTED: "Rechazado",
} as const;

export const POI_CATEGORY_LABELS = {
  BEACH: "Playa",
  SCHOOL: "Colegio",
  HEALTH: "Salud",
  SHOPPING: "Compras",
  TRANSPORT: "Transporte",
  GOLF: "Golf",
  RESTAURANT: "Restaurante",
} as const;

export const WEBHOOK_STATUS_LABELS = {
  PENDING: "Pendiente",
  DELIVERED: "Entregado",
  FAILED: "Fallido",
} as const;
