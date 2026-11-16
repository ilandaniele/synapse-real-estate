import { claimJob, type Db } from "@synapse/db";
import { processRenderJob } from "./process";

export const POLL_INTERVAL_MS = 2_000;

/**
 * Polls RENDER jobs until `signal` aborts. Returns once the in-flight render (if any) has finished.
 * Exported so the API can embed the worker when running on single-process PGlite.
 */
export async function runRenderWorker(db: Db, signal: AbortSignal, intervalMs = POLL_INTERVAL_MS): Promise<void> {
  while (!signal.aborted) {
    try {
      const job = await claimJob(db, "RENDER");
      if (job) {
        const status = await processRenderJob(db, job);
        console.log(`[render-worker] job ${job.id} -> ${status}`);
        continue;
      }
    } catch (error) {
      console.error("[render-worker] loop error", error);
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMs);
      signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
    });
  }
}
