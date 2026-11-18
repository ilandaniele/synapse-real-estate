import type { FileKind } from "@synapse/domain";

export * from "./ifc";

export const DXF_REFERENCE_NOTE = "DXF parsed for reference only; geometry not converted to 3D automatically";

export function unsupportedFormatMessage(kind: FileKind | string): string {
  return `Format ${kind.toUpperCase()} not supported by the automatic pipeline. Export to GLB/glTF from your CAD/BIM tool (e.g. Blender, Revit + exporter) and upload again.`;
}

// ---------------------------------------------------------------- GLB

export type GlbInspection =
  | { ok: true; version: number; nodeNames: string[]; meshCount: number; materialCount: number; sceneCount: number }
  | { ok: false; error: string };

interface GltfJson {
  asset?: { version?: string };
  nodes?: { name?: string }[];
  meshes?: unknown[];
  materials?: unknown[];
  scenes?: unknown[];
}

/** Reads the GLB container header + JSON chunk. Does not decode binary buffers. */
export function inspectGlb(bytes: Uint8Array): GlbInspection {
  if (bytes.byteLength < 20) return { ok: false, error: "File too small to be a GLB" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) return { ok: false, error: "Missing glTF magic header" };
  const version = view.getUint32(4, true);
  if (version !== 2) return { ok: false, error: `Unsupported GLB container version ${version}` };
  const totalLength = view.getUint32(8, true);
  if (totalLength > bytes.byteLength) return { ok: false, error: "GLB is truncated (declared length exceeds file size)" };
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) return { ok: false, error: "First GLB chunk is not JSON" };
  if (20 + jsonLength > bytes.byteLength) return { ok: false, error: "GLB JSON chunk exceeds file size" };
  let json: GltfJson;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GltfJson;
  } catch {
    return { ok: false, error: "GLB JSON chunk is not valid JSON" };
  }
  if (!json.asset?.version?.startsWith("2")) return { ok: false, error: "glTF asset.version must be 2.x" };
  const nodeNames = (json.nodes ?? []).map((n) => n.name).filter((n): n is string => typeof n === "string" && n.length > 0);
  return {
    ok: true,
    version,
    nodeNames,
    meshCount: json.meshes?.length ?? 0,
    materialCount: json.materials?.length ?? 0,
    sceneCount: json.scenes?.length ?? 0,
  };
}

export interface MeshMappingSuggestion {
  meshName: string;
  unitCode: string;
}

/** Root villa groups named Villa_01, Villa_2... are suggested for unit codes V1, V2... A human must approve them. */
export function suggestMeshMappings(nodeNames: readonly string[]): MeshMappingSuggestion[] {
  const seen = new Set<string>();
  const out: MeshMappingSuggestion[] = [];
  for (const name of nodeNames) {
    const match = /^Villa_(\d+)$/.exec(name);
    if (!match || seen.has(name)) continue;
    seen.add(name);
    out.push({ meshName: name, unitCode: `V${Number(match[1])}` });
  }
  return out.sort((a, b) => Number(a.unitCode.slice(1)) - Number(b.unitCode.slice(1)));
}

// ---------------------------------------------------------------- DXF

export interface DxfExtents {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DxfInspection {
  entityCounts: { LINE: number; LWPOLYLINE: number; other: number };
  layers: string[];
  extents: DxfExtents | null;
  note: string;
}

/** Minimal ASCII DXF reader: counts LINE/LWPOLYLINE, lists layers, computes 2D extents. Geometry is NOT converted. */
export function inspectDxf(text: string): DxfInspection {
  const lines = text.split(/\r?\n/);
  const counts = { LINE: 0, LWPOLYLINE: 0, other: 0 };
  const layers = new Set<string>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const point = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  let section = "";
  let entity = "";
  let pendingX: number | null = null;
  let expectSectionName = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number((lines[i] ?? "").trim());
    const value = (lines[i + 1] ?? "").trim();
    if (code === 0) {
      pendingX = null;
      if (value === "SECTION") {
        expectSectionName = true;
        entity = "";
      } else if (value === "ENDSEC") {
        section = "";
        entity = "";
      } else {
        entity = value;
        if (section === "ENTITIES") {
          if (value === "LINE" || value === "LWPOLYLINE") counts[value] += 1;
          else counts.other += 1;
        }
      }
      continue;
    }
    if (expectSectionName && code === 2) {
      section = value;
      expectSectionName = false;
      continue;
    }
    if (section === "TABLES" && entity === "LAYER" && code === 2) layers.add(value);
    if (section !== "ENTITIES") continue;
    if (code === 8) layers.add(value);
    if (entity === "LINE" || entity === "LWPOLYLINE") {
      // LINE: 10/20 start, 11/21 end. LWPOLYLINE: repeated 10/20 vertices.
      if (code === 10 || code === 11) pendingX = Number(value);
      else if ((code === 20 || code === 21) && pendingX !== null) {
        point(pendingX, Number(value));
        pendingX = null;
      }
    }
  }
  return {
    entityCounts: counts,
    layers: [...layers].sort(),
    extents: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null,
    note: DXF_REFERENCE_NOTE,
  };
}
