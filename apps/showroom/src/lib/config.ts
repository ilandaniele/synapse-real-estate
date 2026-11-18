export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
export const DEVELOPMENT_SLUG = "lomas-del-faro";
export const MANIFEST_URL = `${API_URL}/api/v1/public/developments/${DEVELOPMENT_SLUG}/manifest`;
export const LEADS_URL = `${API_URL}/api/v1/public/leads`;
export const RESERVATIONS_URL = `${API_URL}/api/v1/public/reservations`;
export const VISITS_URL = `${API_URL}/api/v1/public/visits`;
