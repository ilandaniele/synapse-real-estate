import { Document, NodeIO, type Material, type Node, type Primitive } from "@gltf-transform/core";
import type { MeshData } from "./geometry";
import { roadParts, streetLights, vegetation } from "./masterplan/landscape";
import { createPalette, type MaterialName, type Palette } from "./masterplan/materials";
import { mergeParts, type Parts } from "./masterplan/parts";
import { PLOTS, ROAD_LEVEL, roadCenterZ, terrainMesh, terrainSkirtMesh } from "./masterplan/terrain";
import { villaParts } from "./masterplan/villas";

/**
 * Masterplan model: a scale-model hillside with a curved street, vegetation and 8 villas in three
 * typologies on two terraces. Units are meters, Y up, centered on the origin (about 200 m wide).
 */
function addPrimitive(doc: Document, mesh: MeshData, material: Material): Primitive {
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const prim = doc.createPrimitive().setMaterial(material);
  prim.setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(mesh.positions)).setBuffer(buffer));
  prim.setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(mesh.normals)).setBuffer(buffer));
  if (mesh.colors) prim.setAttribute("COLOR_0", doc.createAccessor().setType("VEC3").setArray(new Float32Array(mesh.colors)).setBuffer(buffer));
  const idx = mesh.positions.length / 3 > 65535 ? new Uint32Array(mesh.indices) : new Uint16Array(mesh.indices);
  prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(idx).setBuffer(buffer));
  return prim;
}

export interface MasterplanModel {
  glb: Uint8Array;
  /** All node names in the file. */
  nodes: string[];
  units: Array<{ code: string; node: string; labelPosition: [number, number, number] }>;
}

export async function buildMasterplanGlb(): Promise<MasterplanModel> {
  const doc = new Document();
  doc.createBuffer("masterplan");
  doc.getRoot().getAsset().generator = "Synapse demo generator";
  const scene = doc.createScene("Masterplan");
  const palette = createPalette(doc);

  const meshNode = (name: string, parts: Array<[MeshData, Material]>): Node => {
    const m = doc.createMesh(name);
    for (const [mesh, material] of parts) if (mesh.indices.length > 0) m.addPrimitive(addPrimitive(doc, mesh, material));
    return doc.createNode(name).setMesh(m);
  };
  const partsNode = (name: string, parts: Parts): Node => meshNode(name, withMaterials(parts, palette));

  scene.addChild(
    meshNode("Terrain", [
      [terrainMesh(), palette.Terrain_Grass],
      [terrainSkirtMesh(), palette.Terrain_Soil],
    ]),
  );
  scene.addChild(partsNode("Road", mergeParts(roadParts(), streetLights())));

  const units: MasterplanModel["units"] = [];
  for (const p of PLOTS) {
    const villa = villaParts(p.index, p.facing);
    const group = doc.createNode(p.node).setTranslation([p.cx, p.level, p.cz]).setExtras({ unitCode: p.code });
    group.addChild(partsNode(`${p.node}_Body`, villa.body));
    group.addChild(partsNode(`${p.node}_Roof`, villa.roof));
    group.addChild(partsNode(`${p.node}_Pool`, villa.pool));
    group.addChild(partsNode(`${p.node}_Garden`, villa.garden));
    // Each plot owns its material so the frontend can tint it by commercial status.
    const plotMaterial = doc.createMaterial(`${p.node}_Plot_Mat`).setBaseColorFactor([0.86, 0.83, 0.75, 1]).setRoughnessFactor(0.9).setMetallicFactor(0);
    group.addChild(meshNode(`${p.node}_Plot`, [[villa.plot, plotMaterial]]));
    scene.addChild(group);
    units.push({ code: p.code, node: p.node, labelPosition: [p.cx, round(p.level + villa.height + 3), p.cz] });
  }

  scene.addChild(partsNode("Trees", vegetation()));
  scene.addChild(viewpoints(doc));

  const glb = await new NodeIO().writeBinary(doc);
  const nodes = doc
    .getRoot()
    .listNodes()
    .map((n) => n.getName());
  return { glb, nodes, units };
}

function withMaterials(parts: Parts, palette: Palette): Array<[MeshData, Material]> {
  return (Object.entries(parts) as Array<[MaterialName, MeshData]>).map(([name, mesh]) => [mesh, palette[name]]);
}

/**
 * Empty PANO_* nodes mark where the offline renderer places its 360 cameras (eye height, facing -Z at yaw 0).
 * The web viewer ignores them because they have no mesh.
 */
function viewpoints(doc: Document): Node {
  const group = doc.createNode("Viewpoints");
  const villa6 = PLOTS[5];
  const marks: Array<[string, [number, number, number], number]> = [
    ["PANO_Acceso", [0, ROAD_LEVEL + 1.6, roadCenterZ(0)], 0],
    ["PANO_Mirador", [0, ROAD_LEVEL + 12, roadCenterZ(0)], 0],
  ];
  if (villa6) marks.push([`PANO_Terraza_${villa6.code}`, [villa6.cx, villa6.level + 1.7, villa6.cz + 11], 0]);
  for (const [name, position, yaw] of marks) group.addChild(doc.createNode(name).setTranslation(position).setRotation(yawQuat(yaw)));
  return group;
}

function yawQuat(yaw: number): [number, number, number, number] {
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
