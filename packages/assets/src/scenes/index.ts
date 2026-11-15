import type { PerspectiveCamera } from "../raytracer/render";
import type { Vec3 } from "../raytracer/math";
import { lookAt } from "../raytracer/math";
import type { Scene } from "../raytracer/scene";
import { exteriorScene } from "./exterior";
import { doorBetween, doorCenter, EXTERIOR_CAMERA, floorPlanPoint, ROOMS, type SceneSlug } from "./layout";
import { ROOM_BUILDERS } from "./rooms";

export type SceneKey = SceneSlug | "exterior-dusk";

/** Scenes are built lazily and cached per process (each worker thread has its own cache). */
const cache = new Map<SceneKey, Scene>();

export function buildScene(key: SceneKey): Scene {
  const hit = cache.get(key);
  if (hit) return hit;
  const scene = key === "exterior" ? exteriorScene("day") : key === "exterior-dusk" ? exteriorScene("dusk") : ROOM_BUILDERS[key]();
  cache.set(key, scene);
  return scene;
}

export interface HotspotDef {
  label: string;
  targetSlug: SceneSlug | null;
  type: "NAVIGATION" | "INFO";
  description?: string;
  /** World-space point the hotspot is anchored to (a rendered doorway / feature). */
  anchor: Vec3;
}

export interface PanoDef {
  slug: SceneSlug;
  name: string;
  camera: Vec3;
  /** Marzipano convention radians: yaw 0 = -Z, positive pitch = up. */
  initialView: { yaw: number; pitch: number; fov: number };
  hotspots: HotspotDef[];
  floorPlanPoint: { x: number; y: number };
}

const nav = (from: SceneSlug, to: SceneSlug, label: string): HotspotDef => ({
  label,
  targetSlug: to,
  type: "NAVIGATION",
  anchor: doorCenter(doorBetween(from, to)),
});

export const PANORAMAS: PanoDef[] = [
  {
    slug: "exterior",
    name: "Exterior y piscina",
    camera: EXTERIOR_CAMERA,
    initialView: { yaw: 0.3, pitch: 0.02, fov: 1.4 },
    hotspots: [nav("exterior", "living", "Entrar a la vivienda")],
  },
  {
    slug: "living",
    name: "Living",
    camera: ROOMS.living.camera,
    initialView: { yaw: 2.9, pitch: 0.05, fov: 1.5 },
    hotspots: [
      nav("living", "exterior", "Salir al jardín"),
      nav("living", "comedor", "Comedor"),
      nav("living", "dormitorio", "Dormitorio principal"),
      {
        label: "Ventanal de doble altura",
        targetSlug: null,
        type: "INFO",
        description: "Ventanal de 6 m de ancho y 4,6 m de alto con carpintería de aluminio y vidrio de baja emisividad.",
        anchor: [3.8, 2.6, 12],
      },
    ],
  },
  {
    slug: "comedor",
    name: "Comedor",
    camera: ROOMS.comedor.camera,
    initialView: { yaw: 2.3, pitch: 0.02, fov: 1.5 },
    hotspots: [nav("comedor", "living", "Living"), nav("comedor", "cocina", "Cocina")],
  },
  {
    slug: "cocina",
    name: "Cocina",
    camera: ROOMS.cocina.camera,
    initialView: { yaw: 0.2, pitch: -0.05, fov: 1.5 },
    hotspots: [nav("cocina", "comedor", "Comedor")],
  },
  {
    slug: "dormitorio",
    name: "Dormitorio principal",
    camera: ROOMS.dormitorio.camera,
    initialView: { yaw: -1.5, pitch: 0, fov: 1.5 },
    hotspots: [nav("dormitorio", "living", "Living"), nav("dormitorio", "bano", "Baño")],
  },
  {
    slug: "bano",
    name: "Baño",
    camera: ROOMS.bano.camera,
    initialView: { yaw: 1.1, pitch: 0, fov: 1.5 },
    hotspots: [nav("bano", "dormitorio", "Dormitorio")],
  },
].map((p) => ({ ...p, floorPlanPoint: floorPlanPoint(p.slug as SceneSlug) })) as PanoDef[];

/** Marzipano yaw/pitch of a hotspot, computed from the same geometry that was rendered. */
export function hotspotAngles(pano: PanoDef, h: HotspotDef): { yaw: number; pitch: number } {
  return lookAt(pano.camera, h.anchor);
}

export interface GalleryDef {
  file: string;
  title: string;
  sceneKey: SceneKey;
  camera: PerspectiveCamera;
  width: number;
  height: number;
}

const deg = (d: number): number => (d * Math.PI) / 180;

export const GALLERY: GalleryDef[] = [
  {
    file: "gallery/living.jpg",
    title: "Living de doble altura",
    sceneKey: "living",
    camera: { kind: "persp", pos: [9.2, 1.5, 5.9], yaw: deg(-118), pitch: deg(2), fov: deg(84) },
    width: 1600,
    height: 1000,
  },
  {
    file: "gallery/cocina.jpg",
    title: "Cocina con isla",
    sceneKey: "cocina",
    camera: { kind: "persp", pos: [15.4, 1.5, 4.5], yaw: deg(-55), pitch: deg(-4), fov: deg(82) },
    width: 1600,
    height: 1000,
  },
  {
    file: "gallery/dormitorio.jpg",
    title: "Dormitorio principal",
    sceneKey: "dormitorio",
    camera: { kind: "persp", pos: [5.5, 1.45, 4.5], yaw: deg(-62), pitch: deg(-3), fov: deg(82) },
    width: 1600,
    height: 1000,
  },
  {
    file: "gallery/exterior-pool.jpg",
    title: "Piscina y terraza",
    sceneKey: "exterior",
    camera: { kind: "persp", pos: [23.5, 1.5, 16.5], yaw: deg(-62), pitch: deg(3), fov: deg(86) },
    width: 1600,
    height: 1000,
  },
  {
    file: "gallery/exterior-aerial.jpg",
    title: "Vista aérea de la parcela",
    sceneKey: "exterior",
    camera: { kind: "persp", pos: [-8, 17, 34], yaw: deg(26), pitch: deg(-27), fov: deg(70) },
    width: 1600,
    height: 1000,
  },
];

export const HERO = {
  file: "hero.jpg",
  sceneKey: "exterior-dusk" as SceneKey,
  camera: { kind: "persp", pos: [15, 1.8, 36], yaw: deg(-17), pitch: deg(4), fov: deg(70) } as PerspectiveCamera,
  width: 2400,
  height: 1200,
};
