import type { Box, Opening } from "./raytracer/scene";
import { buildScene } from "./scenes/index";
import { DOORS, HOUSE, PLAN, planX, planY, POOL, POOL_DECK, ROOMS, TERRACE, type DoorDef, type RoomSlug } from "./scenes/layout";

const FONT = "Helvetica, Arial, sans-serif";
const WALL = "#2a2a2a";
const WALL_W = 7;
const PAPER = "#fbfaf7";

const ROOM_FILL: Record<RoomSlug, string> = {
  living: "#f2e7d4",
  comedor: "#f2e7d4",
  cocina: "#ebe6dc",
  dormitorio: "#f0e4d6",
  bano: "#dbe8ec",
};

const s = PLAN.scale;
const px = planX;
const py = planY;
const num = (v: number): string => (Math.round(v * 10) / 10).toString();

function rect(x0: number, z0: number, x1: number, z1: number, attrs: string): string {
  return `<rect x="${num(px(x0))}" y="${num(py(z0))}" width="${num((x1 - x0) * s)}" height="${num((z1 - z0) * s)}" ${attrs}/>`;
}

function furniture(boxes: Box[]): string {
  return boxes
    .filter((b) => b.plan)
    .map((b) => `<rect x="${num(px(b.min[0]))}" y="${num(py(b.min[2]))}" width="${num((b.max[0] - b.min[0]) * s)}" height="${num((b.max[2] - b.min[2]) * s)}" rx="2" fill="#ffffff" fill-opacity="0.55" stroke="#8a8377" stroke-width="1.3"/>`)
    .join("\n    ");
}

/** Door gap + leaf + swing arc. `into` is the direction (unit vector in plan axes) the leaf swings toward. */
function doorSymbol(d: DoorDef, into: [number, number]): string {
  const w = (d.hi - d.lo) * s;
  const gap = d.axis === "z" ? `<rect x="${num(px(d.lo))}" y="${num(py(d.plane) - WALL_W / 2 - 0.5)}" width="${num(w)}" height="${WALL_W + 1}" fill="${PAPER}"/>` : `<rect x="${num(px(d.plane) - WALL_W / 2 - 0.5)}" y="${num(py(d.lo))}" width="${WALL_W + 1}" height="${num(w)}" fill="${PAPER}"/>`;
  const H: [number, number] = d.axis === "z" ? [px(d.lo), py(d.plane)] : [px(d.plane), py(d.lo)];
  const E: [number, number] = d.axis === "z" ? [px(d.hi), py(d.plane)] : [px(d.plane), py(d.hi)];
  const L: [number, number] = [H[0] + into[0] * w, H[1] + into[1] * w];
  const cross = (L[0] - H[0]) * (E[1] - H[1]) - (L[1] - H[1]) * (E[0] - H[0]);
  const sweep = cross > 0 ? 1 : 0;
  return `${gap}
    <line x1="${num(H[0])}" y1="${num(H[1])}" x2="${num(L[0])}" y2="${num(L[1])}" stroke="${WALL}" stroke-width="2"/>
    <path d="M ${num(L[0])} ${num(L[1])} A ${num(w)} ${num(w)} 0 0 ${sweep} ${num(E[0])} ${num(E[1])}" fill="none" stroke="#6b665c" stroke-width="1" stroke-dasharray="3 3"/>`;
}

/** Wide opening without a leaf (cased opening). */
function openingSymbol(d: DoorDef): string {
  const w = (d.hi - d.lo) * s;
  return d.axis === "z"
    ? `<rect x="${num(px(d.lo))}" y="${num(py(d.plane) - WALL_W / 2 - 0.5)}" width="${num(w)}" height="${WALL_W + 1}" fill="${PAPER}"/>`
    : `<rect x="${num(px(d.plane) - WALL_W / 2 - 0.5)}" y="${num(py(d.lo))}" width="${WALL_W + 1}" height="${num(w)}" fill="${PAPER}"/>`;
}

function windowSymbol(slug: RoomSlug, op: Opening): string {
  const room = ROOMS[slug];
  let x: number;
  let y: number;
  let w: number;
  let h: number;
  if (op.wall === "N" || op.wall === "S") {
    const z = op.wall === "N" ? room.z0 : room.z1;
    [x, y, w, h] = [px(op.a), py(z) - WALL_W / 2, (op.b - op.a) * s, WALL_W];
  } else {
    const xx = op.wall === "W" ? room.x0 : room.x1;
    [x, y, w, h] = [px(xx) - WALL_W / 2, py(op.a), WALL_W, (op.b - op.a) * s];
  }
  const horizontal = w > h;
  const mid = horizontal ? `<line x1="${num(x)}" y1="${num(y + h / 2)}" x2="${num(x + w)}" y2="${num(y + h / 2)}" stroke="#5f9ab8" stroke-width="2"/>` : `<line x1="${num(x + w / 2)}" y1="${num(y)}" x2="${num(x + w / 2)}" y2="${num(y + h)}" stroke="#5f9ab8" stroke-width="2"/>`;
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${PAPER}" stroke="${WALL}" stroke-width="1"/>\n    ${mid}`;
}

function label(x: number, z: number, text: string, sub: string): string {
  return `<text x="${num(px(x))}" y="${num(py(z))}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="700" fill="#2d2b27">${text}</text>
    <text x="${num(px(x))}" y="${num(py(z) + 16)}" text-anchor="middle" font-family="${FONT}" font-size="12" fill="#6b665c">${sub}</text>`;
}

/** Floorplan of Villa 6 (viewBox 0 0 1000 700), built from the same geometry as the panoramas. */
export function buildFloorplanSvg(): string {
  const slugs = Object.keys(ROOMS) as RoomSlug[];
  const parts: string[] = [];

  // outdoor surfaces
  parts.push(rect(Math.max(TERRACE.x0, -0.9), TERRACE.z0, TERRACE.x1, TERRACE.z1, `fill="#e6e1d6" stroke="#b9b3a5" stroke-width="1"`));
  parts.push(rect(POOL_DECK.x0, POOL_DECK.z0, POOL_DECK.x1, POOL_DECK.z1, `fill="#e6e1d6" stroke="#b9b3a5" stroke-width="1"`));
  parts.push(rect(POOL.x0, POOL.z0, POOL.x1, POOL.z1, `fill="#8ed8e4" stroke="#4aa6bd" stroke-width="3"`));

  // rooms
  for (const slug of slugs) {
    const r = ROOMS[slug];
    parts.push(rect(r.x0, r.z0, r.x1, r.z1, `fill="${ROOM_FILL[slug]}"`));
  }
  // furniture
  for (const slug of slugs) parts.push(`<g>\n    ${furniture(buildScene(slug).boxes)}\n  </g>`);
  // walls
  for (const slug of slugs) {
    const r = ROOMS[slug];
    parts.push(rect(r.x0, r.z0, r.x1, r.z1, `fill="none" stroke="${WALL}" stroke-width="${WALL_W}" stroke-linejoin="miter"`));
  }
  // windows
  for (const slug of slugs) {
    for (const op of buildScene(slug).shell?.openings ?? []) if (op.kind === "window") parts.push(windowSymbol(slug, op));
  }
  // doors
  for (const d of DOORS) {
    if (d.id === "living-comedor") parts.push(openingSymbol(d));
    else if (d.id === "ext-living") parts.push(windowSymbol("living", { id: d.id, wall: "S", a: d.lo, b: d.hi, y0: 0, y1: d.h, kind: "window" }));
    else if (d.id === "living-dormitorio") parts.push(doorSymbol(d, [0, -1]));
    else if (d.id === "comedor-cocina") parts.push(doorSymbol(d, [0, -1]));
    else parts.push(doorSymbol(d, [1, 0]));
  }
  // labels
  const areas = (slug: RoomSlug): string => {
    const r = ROOMS[slug];
    return `${num((r.x1 - r.x0) * (r.z1 - r.z0))} m²`;
  };
  parts.push(label(5.2, 6.4, "Living", areas("living")));
  parts.push(label(13, 10.9, "Comedor", areas("comedor")));
  parts.push(label(12.3, 0.9, "Cocina", areas("cocina")));
  parts.push(label(3.2, 0.9, "Dormitorio", areas("dormitorio")));
  parts.push(label(8, 3.9, "Baño", areas("bano")));
  parts.push(label(8, 13.55, "Terraza", "60 m² (total)"));
  parts.push(label((POOL.x0 + POOL.x1) / 2, (POOL.z0 + POOL.z1) / 2, "Piscina", ""));

  const northX = PLAN.width - 70;
  const barX = px(HOUSE.x0);
  const barY = PLAN.height - 28;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLAN.width} ${PLAN.height}" width="${PLAN.width}" height="${PLAN.height}" role="img" aria-label="Plano de planta de la Villa 6">
  <title>Villa 6 · Planta baja</title>
  <rect width="${PLAN.width}" height="${PLAN.height}" fill="${PAPER}"/>
  <text x="${px(HOUSE.x0)}" y="30" font-family="${FONT}" font-size="20" font-weight="700" fill="#2d2b27">Villa 6 · Planta baja</text>
  <g id="plan">
  ${parts.join("\n  ")}
  </g>
  <g id="north" transform="translate(${northX} 70)">
    <circle r="26" fill="none" stroke="#6b665c" stroke-width="1.5"/>
    <path d="M 0 -20 L 7 8 L 0 3 L -7 8 Z" fill="#2d2b27"/>
    <text y="-32" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="700" fill="#2d2b27">N</text>
  </g>
  <g id="scale">
    <line x1="${barX}" y1="${barY}" x2="${barX + 5 * s}" y2="${barY}" stroke="#2d2b27" stroke-width="3"/>
    <text x="${barX}" y="${barY - 8}" font-family="${FONT}" font-size="12" fill="#2d2b27">0</text>
    <text x="${barX + 5 * s}" y="${barY - 8}" text-anchor="end" font-family="${FONT}" font-size="12" fill="#2d2b27">5 m</text>
  </g>
  <text x="${PLAN.width - 20}" y="${PLAN.height - 12}" text-anchor="end" font-family="${FONT}" font-size="11" fill="#8a8377">Plano demo · Synapse</text>
</svg>
`;
}
