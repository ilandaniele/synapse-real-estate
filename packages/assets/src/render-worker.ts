import { parentPort } from "node:worker_threads";
import { renderRows, type Camera } from "./raytracer/render";
import { buildScene, type SceneKey } from "./scenes/index";

/** One band of rows of one image; pixels are written into the shared RGB buffer. */
export interface RenderUnit {
  jobId: string;
  sceneKey: SceneKey;
  camera: Camera;
  width: number;
  height: number;
  y0: number;
  y1: number;
  spp: number;
  buffer: SharedArrayBuffer;
}

if (!parentPort) throw new Error("render-worker must run inside a worker thread");
const port = parentPort;

port.on("message", (unit: RenderUnit) => {
  const scene = buildScene(unit.sceneKey);
  renderRows(scene, unit.camera, unit.width, unit.height, unit.y0, unit.y1, unit.spp, new Uint8Array(unit.buffer));
  port.postMessage({ jobId: unit.jobId, y0: unit.y0, y1: unit.y1 });
});
