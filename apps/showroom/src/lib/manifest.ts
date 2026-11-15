import { DevelopmentManifest, type Scene, type Unit } from "@synapse/contracts";
import { MANIFEST_URL } from "./config";

export async function fetchManifest(signal?: AbortSignal): Promise<DevelopmentManifest> {
  let res: Response;
  try {
    res = await fetch(MANIFEST_URL, { signal, headers: { Accept: "application/json" } });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.");
  }
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "Este desarrollo aún no está publicado."
        : `El servidor respondió con un error (${res.status}).`,
    );
  }
  const parsed = DevelopmentManifest.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error("La respuesta del servidor no tiene el formato esperado.");
  return parsed.data;
}

export function sortUnits(units: readonly Unit[]): Unit[] {
  return [...units].sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
}

export function scenesForUnit(scenes: readonly Scene[], unitId: string): Scene[] {
  return scenes.filter((s) => s.unitId === unitId).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function unitHasTour(scenes: readonly Scene[], unitId: string): boolean {
  return scenes.some((s) => s.unitId === unitId);
}
