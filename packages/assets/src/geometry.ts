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

/** Appends `src` to `dst` (indices re-based). */
export function mergeMesh(dst: MeshData, src: MeshData): MeshData {
  const base = dst.positions.length / 3;
  dst.positions.push(...src.positions);
  dst.normals.push(...src.normals);
  for (const i of src.indices) dst.indices.push(i + base);
  return dst;
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
