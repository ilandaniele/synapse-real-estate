import { cylinderMesh, lumpy, mergeAll, scaleMesh, sphereMesh, tint, translate, type MeshData } from "../geometry";
import { add, type Parts } from "./parts";

type Rgb = readonly [number, number, number];

export type PlantKind = "pine" | "cypress" | "olive" | "broadleaf" | "bush";

const FOLIAGE: Record<PlantKind, Rgb> = {
  pine: [0.09, 0.19, 0.06],
  cypress: [0.04, 0.12, 0.04],
  olive: [0.22, 0.28, 0.16],
  broadleaf: [0.13, 0.27, 0.06],
  bush: [0.1, 0.22, 0.06],
};

interface Blob {
  r: number;
  at: [number, number, number];
  squash: [number, number, number];
}

/** Crown made of lumpy ellipsoids; trunk height 0 means no trunk. */
const SHAPES: Record<PlantKind, { trunk: [number, number]; blobs: Blob[] }> = {
  pine: {
    trunk: [0.28, 6.2],
    blobs: [
      { r: 3.4, at: [0, 6.6, 0], squash: [1, 0.42, 1] },
      { r: 2.4, at: [1.6, 6.2, 0.9], squash: [1, 0.45, 1] },
      { r: 2.2, at: [-1.4, 6.9, -0.8], squash: [1, 0.45, 1] },
    ],
  },
  cypress: { trunk: [0.18, 1], blobs: [{ r: 4.6, at: [0, 4.8, 0], squash: [0.26, 1, 0.26] }] },
  olive: {
    trunk: [0.3, 1.8],
    blobs: [
      { r: 1.7, at: [0, 2.6, 0], squash: [1, 0.75, 1] },
      { r: 1.3, at: [1.2, 2.3, 0.4], squash: [1, 0.8, 1] },
      { r: 1.2, at: [-0.9, 2.5, -0.9], squash: [1, 0.8, 1] },
    ],
  },
  broadleaf: {
    trunk: [0.32, 2.4],
    blobs: [
      { r: 2.6, at: [0, 4.4, 0], squash: [1, 0.9, 1] },
      { r: 1.9, at: [1.3, 5.6, 0.6], squash: [1, 0.9, 1] },
      { r: 1.7, at: [-1.2, 5.1, -0.7], squash: [1, 0.9, 1] },
    ],
  },
  bush: { trunk: [0, 0], blobs: [{ r: 0.9, at: [0, 0.45, 0], squash: [1.3, 0.75, 1] }] },
};

function blobMesh(b: Blob, seed: number): MeshData {
  const detail = b.r > 1.5 ? 8 : 6;
  const sphere = lumpy(sphereMesh(b.r, detail, detail - 3), b.r * 0.12, seed);
  return translate(scaleMesh(sphere, ...b.squash), ...b.at);
}

/** One plant at (x, y, z) with uniform scale s; `shade` (around 1) varies the foliage tone per instance. */
export function plant(kind: PlantKind, x: number, y: number, z: number, s: number, shade: number, seed: number): Parts {
  const shape = SHAPES[kind];
  const parts: Parts = {};
  const [tr, th] = shape.trunk;
  if (th > 0) add(parts, "Tree_Trunk", translate(scaleMesh(cylinderMesh(tr, th + 0.5, 7), s, s, s), x, y - 0.3, z));
  const base = FOLIAGE[kind];
  const color: Rgb = [base[0] * shade, base[1] * shade, base[2] * shade];
  const crown = mergeAll(shape.blobs.map((b, i) => blobMesh(b, seed + i)));
  add(parts, "Tree_Foliage", translate(scaleMesh(tint(crown, color), s, s, s), x, y, z));
  return parts;
}
