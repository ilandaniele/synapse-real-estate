import { foliage, grass, paving, plaster, sea, solid, tiles, water, woodFloor, type Material } from "../raytracer/materials";
import { fbm2, lerp, normalize, smoothstep, type Vec3 } from "../raytracer/math";
import type { Outdoor, Sky } from "../raytracer/scene";
import { POOL, POOL_DECK, TERRACE } from "./layout";

export type TimeOfDay = "day" | "dusk";

/** Shared materials (module-level so every scene instance reuses them). */
export const M = {
  wood: woodFloor("oak-floor"),
  woodDark: woodFloor("walnut", "#7a4f2e", "#4f301a"),
  plasterWarm: plaster("plaster-warm", "#efe6d6"),
  plasterGreige: plaster("plaster-greige", "#d6c9b6"),
  plasterSage: plaster("plaster-sage", "#b9c1a8"),
  ceiling: plaster("ceiling", "#f6f3ed"),
  kitchenFloor: tiles("kitchen-tile", "#a8a094", "#9d958a", 0.6),
  bathFloor: tiles("bath-floor", "#9d988e", "#8e887d", 0.45),
  bathWall: tiles("bath-wall", "#e8e4da", "#bdb7aa", 0.3, { spec: 0.35 }),
  lacquerWhite: solid("lacquer-white", "#f2f0ea", { spec: 0.25, shine: 50 }),
  lacquerGraphite: solid("lacquer-graphite", "#3b3f43", { spec: 0.3, shine: 50 }),
  oakCabinet: woodFloor("oak-cabinet", "#b98a58", "#8c5f36"),
  steel: solid("steel", "#a3a8ad", { spec: 0.6, shine: 80 }),
  black: solid("black", "#1d1e20", { spec: 0.2, shine: 40 }),
  white: solid("white", "#f3f1ec", { spec: 0.35, shine: 60 }),
  linen: solid("linen", "#efeae0", { spec: 0.02, shine: 4 }),
  headboard: solid("headboard", "#826550", { spec: 0.05, shine: 8 }),
  pot: solid("pot", "#c9c2b4", { spec: 0.1, shine: 20 }),
  leaf: foliage("leaf", "#5c8f3c", "#27562a"),
  trunk: solid("trunk", "#5a4333"),
  roof: solid("roof-slab", "#2f3235", { spec: 0.1, shine: 20 }),
  lounger: solid("lounger", "#ebe8e1", { spec: 0.1, shine: 20 }),
  gravel: tiles("driveway", "#9a948b", "#7d776e", 1.4, { spec: 0.02, shine: 4 }),
  paving: paving("terrace-paving"),
  deck: paving("pool-deck", "#e6e1d6"),
  grass: grass("lawn"),
  sea: sea("sea"),
};

export const POOL_WATER = water("pool-water", (POOL.x0 + POOL.x1) / 2, (POOL.z0 + POOL.z1) / 2, (POOL.x1 - POOL.x0) / 2, (POOL.z1 - POOL.z0) / 2);

const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** Garden ground cover by plot position (meters). */
export function pickGround(x: number, z: number): Material {
  if (inRect(x, z, POOL)) return POOL_WATER;
  if (inRect(x, z, POOL_DECK)) return M.deck;
  if (inRect(x, z, TERRACE)) return M.paving;
  if (x >= 7.5 && x <= 10.5 && z > TERRACE.z1 && z < 17.5) return M.gravel;
  if (z > 95) return M.sea;
  return M.grass;
}

export function makeSky(time: TimeOfDay): Sky {
  if (time === "dusk") {
    return {
      zenith: [0.03, 0.06, 0.22],
      horizon: [1.5, 0.62, 0.33],
      haze: [0.78, 0.45, 0.38],
      sunDir: normalize([-0.62, 0.05, 0.78]),
      sunColor: [3.2, 1.3, 0.5],
      sunSize: 0.03,
      clouds: 0.35,
      hills: [0.25, 0.16, 0.2],
    };
  }
  return {
    zenith: [0.1, 0.27, 0.75],
    horizon: [0.62, 0.78, 0.98],
    haze: [0.72, 0.82, 0.92],
    sunDir: normalize([-0.42, 0.66, 0.62]),
    sunColor: [2.8, 2.45, 1.95],
    sunSize: 0.022,
    clouds: 0.45,
    hills: [0.33, 0.43, 0.55],
  };
}

/** Garden environment shared by interiors (seen through windows) and the exterior scene. */
export function makeOutdoor(time: TimeOfDay): Outdoor {
  const R = 75;
  return {
    sky: makeSky(time),
    ground: { y: 0, pick: pickGround },
    ring: {
      cx: 8,
      cz: 6,
      radius: R,
      // angle 0 points south: leave a gap toward the sea.
      heightAt: (a) => lerp(0, 8 + 7 * fbm2(a * 4 + 2, 1.5, 3, 111), smoothstep(0.45, 0.95, Math.abs(a))),
      material: M.leaf,
    },
    fog: time === "dusk" ? 1 / 420 : 1 / 520,
  };
}

/** Sun/ambient settings per time of day. */
export function lightingFor(time: TimeOfDay): { sun: Vec3; ambTop: Vec3; ambBottom: Vec3 } {
  const sky = makeSky(time);
  if (time === "dusk") return { sun: sky.sunColor.map((c) => c * 0.35) as Vec3, ambTop: [0.14, 0.14, 0.26], ambBottom: [0.1, 0.07, 0.06] };
  return { sun: sky.sunColor.map((c) => c * 0.95) as Vec3, ambTop: [0.46, 0.54, 0.7], ambBottom: [0.26, 0.28, 0.2] };
}
