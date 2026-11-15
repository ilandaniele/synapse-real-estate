import os from "node:os";
import { Worker } from "node:worker_threads";
import type { Camera } from "./raytracer/render";
import type { RenderUnit } from "./render-worker";
import type { SceneKey } from "./scenes/index";

export interface RenderJob {
  id: string;
  sceneKey: SceneKey;
  camera: Camera;
  width: number;
  height: number;
  spp: number;
}

export interface RenderedImage {
  job: RenderJob;
  /** Raw RGB, 3 bytes per pixel. */
  rgb: Buffer;
}

const BAND_ROWS = 16;

/**
 * Renders jobs on a pool of worker threads. Every job is split into row bands that are
 * interleaved across jobs, so the pool stays busy until the last band. `onImage` is called as
 * soon as an image is complete (so encoding overlaps with rendering).
 */
export async function renderJobs(jobs: RenderJob[], onImage: (img: RenderedImage) => Promise<void>): Promise<void> {
  if (jobs.length === 0) return;
  const size = Math.max(1, Math.min(os.availableParallelism() - 1, 16));
  const buffers = new Map<string, SharedArrayBuffer>();
  const remaining = new Map<string, number>();
  const units: RenderUnit[] = [];
  const perJob = jobs.map((job) => {
    const buffer = new SharedArrayBuffer(job.width * job.height * 3);
    buffers.set(job.id, buffer);
    const list: RenderUnit[] = [];
    for (let y = 0; y < job.height; y += BAND_ROWS) {
      list.push({ jobId: job.id, sceneKey: job.sceneKey, camera: job.camera, width: job.width, height: job.height, y0: y, y1: Math.min(job.height, y + BAND_ROWS), spp: job.spp, buffer });
    }
    remaining.set(job.id, list.length);
    return list;
  });
  // Interleave bands round-robin, largest jobs first so they do not become the straggler.
  const order = [...perJob].sort((a, b) => b.length - a.length);
  for (let i = 0; order.some((l) => i < l.length); i++) for (const l of order) if (l[i]) units.push(l[i] as RenderUnit);

  const byId = new Map(jobs.map((j) => [j.id, j]));
  const pending: Promise<void>[] = [];
  let next = 0;

  await new Promise<void>((resolve, reject) => {
    const workers: Worker[] = [];
    let active = 0;
    let failed = false;
    const finish = (err?: unknown): void => {
      if (failed) return;
      if (err) {
        failed = true;
        for (const w of workers) void w.terminate();
        reject(err);
        return;
      }
      if (active === 0 && next >= units.length) {
        for (const w of workers) void w.terminate();
        resolve();
      }
    };
    const feed = (w: Worker): void => {
      const unit = units[next++];
      if (!unit) {
        finish();
        return;
      }
      active++;
      w.postMessage(unit);
    };
    for (let i = 0; i < Math.min(size, units.length); i++) {
      const w = new Worker(new URL("./render-worker.ts", import.meta.url));
      workers.push(w);
      w.on("error", finish);
      w.on("message", (m: { jobId: string }) => {
        active--;
        const left = (remaining.get(m.jobId) ?? 1) - 1;
        remaining.set(m.jobId, left);
        if (left === 0) {
          const job = byId.get(m.jobId);
          const buf = buffers.get(m.jobId);
          if (job && buf) pending.push(onImage({ job, rgb: Buffer.from(buf) }).catch((e) => finish(e)));
        }
        feed(w);
      });
      feed(w);
    }
  });
  await Promise.all(pending);
}
