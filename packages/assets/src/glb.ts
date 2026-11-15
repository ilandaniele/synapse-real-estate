import { Document, NodeIO, type Material, type Node, type Primitive } from "@gltf-transform/core";
import { boxMesh, coneMesh, cylinderMesh, emptyMesh, mergeMesh, quadMesh, type MeshData } from "./geometry";
import { fbm2, mulberry32, smoothstep } from "./raytracer/math";

/**
 * Masterplan model: gently sloped hillside, a curved road, ~40 trees and 8 villas on two terraces.
 * Units are meters, Y up, centered on the origin (about 200 m wide).
 */
export const TERRAIN_SIZE = 200;
const GRID = 80;

const ROWS = [
  { z: -38, level: 3.4 },
  { z: 32, level: -3.2 },
];
const COLS = [-66, -22, 22, 66];
const PLOT_W = 36;
const PLOT_D = 30;
const ROAD_HALF = 3.2;
const ROAD_LEVEL = 0.2;

export interface PlotLayout {
  index: number;
  node: string;
  code: string;
  cx: number;
  cz: number;
  level: number;
}

/** Villa_01..04 on the upper terrace, Villa_05..08 on the lower one. */
export const PLOTS: PlotLayout[] = ROWS.flatMap((row, r) =>
  COLS.map((cx, c) => {
    const index = r * COLS.length + c + 1;
    const n = String(index).padStart(2, "0");
    return { index, node: `Villa_${n}`, code: `V${index}`, cx, cz: row.z, level: row.level };
  }),
);

export function roadCenterZ(x: number): number {
  return -0.5 + 5 * Math.sin(x * 0.045 + 0.6);
}

function boxDistance(x: number, z: number, cx: number, cz: number, hx: number, hz: number): number {
  const dx = Math.abs(x - cx) - hx;
  const dz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}

/** Terrain height: hillside rising toward -Z, flattened under plots and along the road. */
export function terrainHeight(x: number, z: number): number {
  const lower = ROWS[1]?.level ?? 0;
  const upper = ROWS[0]?.level ?? 0;
  let h = lower + (upper - lower) * smoothstep(18, -12, z);
  h += (fbm2(x * 0.03 + 4, z * 0.03 + 9, 4, 7) - 0.5) * 3.2;
  h += 0.0016 * Math.max(0, Math.abs(x) - 85) ** 2 + 0.002 * Math.max(0, -z - 60) ** 2;
  for (const p of PLOTS) {
    const d = boxDistance(x, z, p.cx, p.cz, PLOT_W / 2, PLOT_D / 2);
    const w = 1 - smoothstep(0, 8, d);
    h += (p.level - h) * w;
  }
  const rd = Math.abs(z - roadCenterZ(x)) - ROAD_HALF;
  const wr = 1 - smoothstep(0, 7, rd);
  h += (ROAD_LEVEL - h) * wr;
  return h;
}

function terrainMesh(): MeshData {
  const step = TERRAIN_SIZE / GRID;
  const n = GRID + 1;
  const m = emptyMesh();
  m.colors = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -TERRAIN_SIZE / 2 + i * step;
      const z = -TERRAIN_SIZE / 2 + j * step;
      const y = terrainHeight(x, z);
      m.positions.push(x, y, z);
      const e = 1;
      const nx = terrainHeight(x - e, z) - terrainHeight(x + e, z);
      const nz = terrainHeight(x, z - e) - terrainHeight(x, z + e);
      const l = Math.hypot(nx, 2 * e, nz);
      m.normals.push(nx / l, (2 * e) / l, nz / l);
      const v = fbm2(x * 0.08, z * 0.08, 3, 3);
      const dry = smoothstep(0.55, 0.9, fbm2(x * 0.02 + 40, z * 0.02, 3, 5));
      m.colors.push(0.3 + 0.22 * v + 0.12 * dry, 0.5 + 0.18 * v - 0.06 * dry, 0.22 + 0.1 * v);
    }
  }
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      m.indices.push(a, c, b, b, c, d);
    }
  }
  return m;
}

function roadMesh(): MeshData {
  const m = emptyMesh();
  const segs = 80;
  for (let i = 0; i <= segs; i++) {
    const x = -TERRAIN_SIZE / 2 + (i / segs) * TERRAIN_SIZE;
    const zc = roadCenterZ(x);
    for (const side of [-1, 1]) {
      const z = zc + side * ROAD_HALF;
      m.positions.push(x, terrainHeight(x, z) + 0.07, z);
      m.normals.push(0, 1, 0);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    m.indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  return m;
}

interface VillaParts {
  body: MeshData;
  roof: MeshData;
  pool: MeshData;
  plot: MeshData;
}

/** Two stacked, offset volumes with thin roof slabs, a pool and a plot quad (local frame, front = +Z). */
function villaParts(index: number): VillaParts {
  const side = index % 2 === 0 ? -1 : 1;
  const jitter = (index * 37) % 5;
  const w1 = 17 + jitter * 0.6;
  const d1 = 10.5 + (jitter % 3) * 0.5;
  const h1 = 3.2;
  const w2 = 10.5 + (jitter % 2);
  const d2 = 7.5;
  const h2 = 3.0;
  const c1x = -side * 0.5;
  const c1z = -4;
  const c2x = c1x + side * (w1 / 2 - w2 / 2 - 1);
  const c2z = c1z - 1.5;

  const body = mergeMesh(boxMesh(c1x, h1 / 2 + 0.06, c1z, w1, h1, d1), boxMesh(c2x, h1 + h2 / 2 + 0.06, c2z, w2, h2, d2));
  const roof = mergeMesh(boxMesh(c1x, h1 + 0.06 + 0.15, c1z, w1 + 1.2, 0.3, d1 + 1.2), boxMesh(c2x, h1 + h2 + 0.06 + 0.15, c2z, w2 + 1.2, 0.3, d2 + 1.2));
  const pool = boxMesh(c1x - side * 2, 0.16, c1z + d1 / 2 + 5, 8, 0.2, 3.6);
  const plot = quadMesh(-PLOT_W / 2 + 1, PLOT_W / 2 - 1, -PLOT_D / 2 + 1, PLOT_D / 2 - 1, 0.06);
  return { body, roof, pool, plot };
}

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

function pbr(doc: Document, name: string, rgb: [number, number, number], roughness: number, metallic = 0): Material {
  return doc.createMaterial(name).setBaseColorFactor([rgb[0], rgb[1], rgb[2], 1]).setRoughnessFactor(roughness).setMetallicFactor(metallic);
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

  const mWhite = pbr(doc, "Render_White", [0.95, 0.94, 0.91], 0.7);
  const mRoof = pbr(doc, "Roof_Dark", [0.16, 0.17, 0.19], 0.55, 0.1);
  const mPool = pbr(doc, "Pool_Water", [0.08, 0.55, 0.78], 0.12);
  const mTerrain = pbr(doc, "Terrain_Grass", [1, 1, 1], 0.95);
  const mRoad = pbr(doc, "Road_Asphalt", [0.2, 0.2, 0.21], 0.9);
  const mLeaf = pbr(doc, "Tree_Foliage", [0.16, 0.4, 0.18], 0.85);
  const mTrunk = pbr(doc, "Tree_Trunk", [0.34, 0.23, 0.14], 0.9);

  const meshNode = (name: string, mesh: MeshData, material: Material): Node => {
    const m = doc.createMesh(name).addPrimitive(addPrimitive(doc, mesh, material));
    return doc.createNode(name).setMesh(m);
  };

  scene.addChild(meshNode("Terrain", terrainMesh(), mTerrain));
  scene.addChild(meshNode("Road", roadMesh(), mRoad));

  // Villas
  const units: MasterplanModel["units"] = [];
  for (const p of PLOTS) {
    const parts = villaParts(p.index);
    const group = doc.createNode(p.node).setTranslation([p.cx, p.level, p.cz]).setExtras({ unitCode: p.code });
    group.addChild(meshNode(`${p.node}_Body`, parts.body, mWhite));
    group.addChild(meshNode(`${p.node}_Roof`, parts.roof, mRoof));
    group.addChild(meshNode(`${p.node}_Pool`, parts.pool, mPool));
    // Each plot owns its material so the frontend can tint it by commercial status.
    group.addChild(meshNode(`${p.node}_Plot`, parts.plot, pbr(doc, `${p.node}_Plot_Mat`, [0.86, 0.83, 0.75], 0.9)));
    scene.addChild(group);
    units.push({ code: p.code, node: p.node, labelPosition: [p.cx, round(p.level + 9), p.cz] });
  }

  // Trees: two shared meshes reused by every tree node.
  const trunkMesh = doc.createMesh("Tree_Trunk").addPrimitive(addPrimitive(doc, cylinderMesh(0.35, 2.2, 8), mTrunk));
  const crownMesh = doc.createMesh("Tree_Crown").addPrimitive(addPrimitive(doc, mergeMesh(translate(coneMesh(2.4, 4.5, 10), 0, 1.8, 0), translate(coneMesh(1.8, 3.6, 10), 0, 4.2, 0)), mLeaf));
  const trees = doc.createNode("Trees");
  const rand = mulberry32(2024);
  let placed = 0;
  let guard = 0;
  while (placed < 40 && guard++ < 5000) {
    const x = (rand() - 0.5) * 180;
    const z = (rand() - 0.5) * 180;
    if (PLOTS.some((p) => boxDistance(x, z, p.cx, p.cz, PLOT_W / 2, PLOT_D / 2) < 5)) continue;
    if (Math.abs(z - roadCenterZ(x)) < ROAD_HALF + 4) continue;
    placed++;
    const n = String(placed).padStart(2, "0");
    const s = 0.8 + rand() * 0.8;
    const tree = doc.createNode(`Tree_${n}`).setTranslation([x, terrainHeight(x, z), z]).setScale([s, s, s]).setRotation(yawQuat(rand() * Math.PI * 2));
    tree.addChild(doc.createNode(`Tree_${n}_Trunk`).setMesh(trunkMesh));
    tree.addChild(doc.createNode(`Tree_${n}_Crown`).setMesh(crownMesh));
    trees.addChild(tree);
  }
  scene.addChild(trees);

  const io = new NodeIO();
  const glb = await io.writeBinary(doc);
  const nodes = doc
    .getRoot()
    .listNodes()
    .map((n) => n.getName());
  return { glb, nodes, units };
}

function translate(m: MeshData, dx: number, dy: number, dz: number): MeshData {
  for (let i = 0; i < m.positions.length; i += 3) {
    m.positions[i] = (m.positions[i] ?? 0) + dx;
    m.positions[i + 1] = (m.positions[i + 1] ?? 0) + dy;
    m.positions[i + 2] = (m.positions[i + 2] ?? 0) + dz;
  }
  return m;
}

function yawQuat(yaw: number): [number, number, number, number] {
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
