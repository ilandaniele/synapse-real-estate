import { Document, NodeIO, type Material, type Node } from "@gltf-transform/core";
import { IfcAPI, IFCBUILDING, type PlacedGeometry } from "web-ifc";

export const IFC_REVIEW_NOTE = "IFC converted to simple volumes without textures; a human must check geometry and mappings";
export const SITE_NODE_NAME = "Site";

export interface IfcConversion {
  glb: Uint8Array;
  buildings: string[];
  elementCount: number;
  triangleCount: number;
}

interface SpatialNode {
  expressID: number;
  type: string;
  children: SpatialNode[];
}

/**
 * Converts the 3D geometry of an IFC file into a GLB: one root node per IfcBuilding (named after the building)
 * with one child node per element, so `suggestMeshMappings` can propose Villa_NN mappings. Elements outside any
 * building go under a "Site" node. Materials come from IFC surface colours only.
 */
export async function convertIfcToGlb(bytes: Uint8Array): Promise<IfcConversion> {
  const api = new IfcAPI();
  await api.Init();
  const modelID = api.OpenModel(bytes);
  try {
    const buildingOf = await mapElementsToBuildings(api, modelID);
    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene();
    const roots = new Map<string, Node>();
    const materials = new Map<string, Material>();
    let elementCount = 0;
    let triangleCount = 0;

    const rootFor = (name: string) => {
      const existing = roots.get(name);
      if (existing) return existing;
      const node = doc.createNode(name);
      scene.addChild(node);
      roots.set(name, node);
      return node;
    };
    const materialFor = ({ color }: PlacedGeometry) => {
      const key = [color.x, color.y, color.z, color.w].map((c) => c.toFixed(3)).join(",");
      const existing = materials.get(key);
      if (existing) return existing;
      const material = doc
        .createMaterial(`ifc-${materials.size}`)
        .setBaseColorFactor([color.x, color.y, color.z, color.w])
        .setAlphaMode(color.w < 1 ? "BLEND" : "OPAQUE");
      materials.set(key, material);
      return material;
    };

    api.StreamAllMeshes(modelID, (flatMesh) => {
      const mesh = doc.createMesh(elementName(api, modelID, flatMesh.expressID));
      for (let i = 0; i < flatMesh.geometries.size(); i++) {
        const placed = flatMesh.geometries.get(i);
        const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
        const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
        const indices = api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize());
        geometry.delete();
        if (indices.length === 0) continue;
        const { positions, normals } = bakeTransform(vertices, placed.flatTransformation);
        const primitive = doc
          .createPrimitive()
          .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(positions).setBuffer(buffer))
          .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(normals).setBuffer(buffer))
          .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(indices)).setBuffer(buffer))
          .setMaterial(materialFor(placed));
        mesh.addPrimitive(primitive);
        triangleCount += indices.length / 3;
      }
      if (mesh.listPrimitives().length === 0) {
        mesh.dispose();
        return;
      }
      elementCount += 1;
      const node = doc.createNode(mesh.getName()).setMesh(mesh);
      rootFor(buildingOf.get(flatMesh.expressID) ?? SITE_NODE_NAME).addChild(node);
    });

    if (elementCount === 0) throw new Error("IFC has no 3D geometry");
    return {
      glb: await new NodeIO().writeBinary(doc),
      buildings: [...roots.keys()].filter((name) => name !== SITE_NODE_NAME),
      elementCount,
      triangleCount,
    };
  } finally {
    api.CloseModel(modelID);
  }
}

async function mapElementsToBuildings(api: IfcAPI, modelID: number): Promise<Map<number, string>> {
  const root = (await api.properties.getSpatialStructure(modelID)) as SpatialNode;
  const buildingOf = new Map<number, string>();
  const visit = (node: SpatialNode, building: string | undefined) => {
    const current = api.GetLineType(modelID, node.expressID) === IFCBUILDING ? elementName(api, modelID, node.expressID) : building;
    if (current) buildingOf.set(node.expressID, current);
    for (const child of node.children) visit(child, current);
  };
  visit(root, undefined);
  return buildingOf;
}

function elementName(api: IfcAPI, modelID: number, expressID: number): string {
  const line = api.GetLine(modelID, expressID) as { Name?: { value?: unknown } } | undefined;
  const name = line?.Name?.value;
  return typeof name === "string" && name.trim() ? name.trim() : `IFC_${expressID}`;
}

/** web-ifc vertices are interleaved [x, y, z, nx, ny, nz]; the column-major matrix already includes the Y-up conversion. */
function bakeTransform(vertices: Float32Array, m: number[]): { positions: Float32Array<ArrayBuffer>; normals: Float32Array<ArrayBuffer> } {
  const count = vertices.length / 6;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y, z, nx, ny, nz] = vertices.subarray(i * 6, i * 6 + 6) as unknown as number[];
    positions[i * 3] = m[0]! * x! + m[4]! * y! + m[8]! * z! + m[12]!;
    positions[i * 3 + 1] = m[1]! * x! + m[5]! * y! + m[9]! * z! + m[13]!;
    positions[i * 3 + 2] = m[2]! * x! + m[6]! * y! + m[10]! * z! + m[14]!;
    const tx = m[0]! * nx! + m[4]! * ny! + m[8]! * nz!;
    const ty = m[1]! * nx! + m[5]! * ny! + m[9]! * nz!;
    const tz = m[2]! * nx! + m[6]! * ny! + m[10]! * nz!;
    const length = Math.hypot(tx, ty, tz) || 1;
    normals[i * 3] = tx / length;
    normals[i * 3 + 1] = ty / length;
    normals[i * 3 + 2] = tz / length;
  }
  return { positions, normals };
}
