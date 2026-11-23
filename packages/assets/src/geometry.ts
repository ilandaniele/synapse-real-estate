/** Tiny indexed-mesh builders for the masterplan GLB (meters, Y up, CCW winding). */
export interface MeshData {
  positions: number[];
  normals: number[];
  indices: number[];
  colors?: number[];
}

export function emptyMesh(): MeshData {
  return { positions: [], normals: [], indices: [] };
}

/** Appends `src` to `dst` (indices re-based). Vertex colors default to white on the side that lacks them. */
export function mergeMesh(dst: MeshData, src: MeshData): MeshData {
  const base = dst.positions.length / 3;
  if (src.colors && !dst.colors) dst.colors = new Array<number>(dst.positions.length).fill(1);
  dst.positions.push(...src.positions);
  dst.normals.push(...src.normals);
  if (dst.colors) dst.colors.push(...(src.colors ?? new Array<number>(src.positions.length).fill(1)));
  for (const i of src.indices) dst.indices.push(i + base);
  return dst;
}

export function mergeAll(meshes: MeshData[]): MeshData {
  return meshes.reduce((acc, m) => mergeMesh(acc, m), emptyMesh());
}

export function translate(m: MeshData, dx: number, dy: number, dz: number): MeshData {
  for (let i = 0; i < m.positions.length; i += 3) {
    m.positions[i] = (m.positions[i] ?? 0) + dx;
    m.positions[i + 1] = (m.positions[i + 1] ?? 0) + dy;
    m.positions[i + 2] = (m.positions[i + 2] ?? 0) + dz;
  }
  return m;
}

/** Rotation around +Y; yaw = PI/2 turns +Z into +X. */
export function rotateY(m: MeshData, yaw: number): MeshData {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  for (const arr of [m.positions, m.normals]) {
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i] ?? 0;
      const z = arr[i + 2] ?? 0;
      arr[i] = x * c + z * s;
      arr[i + 2] = -x * s + z * c;
    }
  }
  return m;
}

/** Mirror across the YZ plane; triangle winding is flipped back so faces stay front-facing. */
export function mirrorX(m: MeshData): MeshData {
  for (let i = 0; i < m.positions.length; i += 3) {
    m.positions[i] = -(m.positions[i] ?? 0);
    m.normals[i] = -(m.normals[i] ?? 0);
  }
  for (let i = 0; i < m.indices.length; i += 3) {
    const b = m.indices[i + 1] ?? 0;
    m.indices[i + 1] = m.indices[i + 2] ?? 0;
    m.indices[i + 2] = b;
  }
  return m;
}

export function scaleMesh(m: MeshData, sx: number, sy: number, sz: number): MeshData {
  for (let i = 0; i < m.positions.length; i += 3) {
    m.positions[i] = (m.positions[i] ?? 0) * sx;
    m.positions[i + 1] = (m.positions[i + 1] ?? 0) * sy;
    m.positions[i + 2] = (m.positions[i + 2] ?? 0) * sz;
    const nx = (m.normals[i] ?? 0) / sx;
    const ny = (m.normals[i + 1] ?? 0) / sy;
    const nz = (m.normals[i + 2] ?? 0) / sz;
    const l = Math.hypot(nx, ny, nz) || 1;
    m.normals[i] = nx / l;
    m.normals[i + 1] = ny / l;
    m.normals[i + 2] = nz / l;
  }
  return m;
}

export function tint(m: MeshData, rgb: readonly [number, number, number]): MeshData {
  m.colors = [];
  for (let i = 0; i < m.positions.length; i += 3) m.colors.push(rgb[0], rgb[1], rgb[2]);
  return m;
}

type Vec3 = [number, number, number];

/** Flat-shaded convex polygons; each is oriented to face away from `center`. */
export function polygonsMesh(polygons: Vec3[][], center: Vec3): MeshData {
  const m = emptyMesh();
  for (const poly of polygons) {
    const [a, b, c] = poly as [Vec3, Vec3, Vec3];
    const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const centroid = poly.reduce<Vec3>((acc, p) => [acc[0] + p[0] / poly.length, acc[1] + p[1] / poly.length, acc[2] + p[2] / poly.length], [0, 0, 0]);
    const outward = (centroid[0] - center[0]) * n[0] + (centroid[1] - center[1]) * n[1] + (centroid[2] - center[2]) * n[2] >= 0;
    const ordered = outward ? poly : [...poly].reverse();
    if (!outward) n = [-n[0], -n[1], -n[2]];
    const l = Math.hypot(...n) || 1;
    const base = m.positions.length / 3;
    for (const p of ordered) {
      m.positions.push(...p);
      m.normals.push(n[0] / l, n[1] / l, n[2] / l);
    }
    for (let i = 1; i < ordered.length - 1; i++) m.indices.push(base, base + i, base + i + 1);
  }
  return m;
}

/** Hip roof over a w x d rectangle centered at the origin, eaves at y = 0, ridge at y = h along the longer side. */
export function hipRoofMesh(w: number, d: number, h: number): MeshData {
  const alongX = w >= d;
  const hw = w / 2;
  const hd = d / 2;
  const r = Math.abs(w - d) / 2;
  const r1: Vec3 = alongX ? [-r, h, 0] : [0, h, -r];
  const r2: Vec3 = alongX ? [r, h, 0] : [0, h, r];
  const p00: Vec3 = [-hw, 0, -hd];
  const p10: Vec3 = [hw, 0, -hd];
  const p11: Vec3 = [hw, 0, hd];
  const p01: Vec3 = [-hw, 0, hd];
  const faces: Vec3[][] = alongX
    ? [[p00, p10, r2, r1], [p01, p11, r2, r1], [p00, p01, r1], [p10, p11, r2]]
    : [[p00, p01, r2, r1], [p10, p11, r2, r1], [p00, p10, r1], [p01, p11, r2]];
  return polygonsMesh(faces, [0, -h, 0]);
}

/** Displaces vertices along their normals with a position hash, so coincident seam vertices move together. */
export function lumpy(m: MeshData, amount: number, seed: number): MeshData {
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i] ?? 0;
    const y = m.positions[i + 1] ?? 0;
    const z = m.positions[i + 2] ?? 0;
    const h = Math.sin(Math.round(x * 100) * 12.9898 + Math.round(y * 100) * 78.233 + Math.round(z * 100) * 37.719 + seed) * 43758.5453;
    const k = (h - Math.floor(h) - 0.5) * 2 * amount;
    m.positions[i] = x + (m.normals[i] ?? 0) * k;
    m.positions[i + 1] = y + (m.normals[i + 1] ?? 0) * k;
    m.positions[i + 2] = z + (m.normals[i + 2] ?? 0) * k;
  }
  return m;
}

/** Axis-aligned box centered at (cx, cy, cz) with flat-shaded faces. */
export function boxMesh(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): MeshData {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const m = emptyMesh();
  // [normal, u axis, v axis] with u x v = normal
  const faces: Array<[[number, number, number], [number, number, number], [number, number, number]]> = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  for (const [n, u, v] of faces) {
    const base = m.positions.length / 3;
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      m.positions.push(
        cx + (n[0] * hx + su * u[0] * hx + sv * v[0] * hx),
        cy + (n[1] * hy + su * u[1] * hy + sv * v[1] * hy),
        cz + (n[2] * hz + su * u[2] * hz + sv * v[2] * hz),
      );
      m.normals.push(n[0], n[1], n[2]);
    }
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return m;
}

/** Flat horizontal quad at height y spanning x0..x1, z0..z1 (normal +Y). */
export function quadMesh(x0: number, x1: number, z0: number, z1: number, y: number): MeshData {
  return {
    positions: [x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

/** Vertical cylinder with smooth side normals; base at y = 0. */
export function cylinderMesh(radius: number, height: number, segments: number): MeshData {
  const m = emptyMesh();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    m.positions.push(c * radius, 0, s * radius, c * radius, height, s * radius);
    m.normals.push(c, 0, s, c, 0, s);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    m.indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  return m;
}

/** Cone (smooth-ish normals); base at y = 0, apex at y = height. */
export function coneMesh(radius: number, height: number, segments: number): MeshData {
  const m = emptyMesh();
  const slope = radius / height;
  const ny = slope / Math.sqrt(1 + slope * slope);
  const nr = 1 / Math.sqrt(1 + slope * slope);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    m.positions.push(c * radius, 0, s * radius, 0, height, 0);
    m.normals.push(c * nr, ny, s * nr, c * nr, ny, s * nr);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    m.indices.push(a, a + 1, a + 2);
  }
  // base disc
  const baseStart = m.positions.length / 3;
  m.positions.push(0, 0, 0);
  m.normals.push(0, -1, 0);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    m.positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    m.normals.push(0, -1, 0);
  }
  for (let i = 0; i < segments; i++) m.indices.push(baseStart, baseStart + 1 + i, baseStart + 2 + i);
  return m;
}

/** Low-poly UV sphere with smooth normals, centered at the origin. */
export function sphereMesh(radius: number, segments: number, rings: number): MeshData {
  const m = emptyMesh();
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      m.positions.push(nx * radius, ny * radius, nz * radius);
      m.normals.push(nx, ny, nz);
    }
  }
  const row = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * row + s;
      const b = a + row;
      m.indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return m;
}
