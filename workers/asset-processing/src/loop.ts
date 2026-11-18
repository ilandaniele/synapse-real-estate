import { claimJob, type Db } from "@synapse/db";
import type { ObjectStorage } from "@synapse/storage";
import { processJob } from "./process";

export const POLL_INTERVAL_MS = 2_000;

/**
 * Polls IMPORT jobs until `signal` aborts. Returns once the in-flight job (if any) has finished.
 * Exported so the API can embed the worker when running on single-process PGlite.
 */
export async function runAssetWorker(db: Db, storage: ObjectStorage, signal: AbortSignal, intervalMs = POLL_INTERVAL_MS): Promise<void> {
  while (!signal.aborted) {
    let job = null;
    try {
      job = await claimJob(db, "IMPORT");
      if (job) {
        const outcome = await processJob(db, job, storage);
        console.log(`[asset-worker] job ${job.id} -> ${outcome.status}`);
        continue; // drain the queue before sleeping
      }
    } catch (error) {
      console.error("[asset-worker] loop error", error);
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMs);
      signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
    });
  }
}
