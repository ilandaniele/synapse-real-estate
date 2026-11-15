import path from "node:path";
import { createDb, migrate, REPO_ROOT } from "@synapse/db";
import { runAssetWorker } from "./loop";

export { processJob, type JobOutcome } from "./process";
export { runAssetWorker, POLL_INTERVAL_MS } from "./loop";

async function main() {
  if (!process.env.DATABASE_URL?.trim() || process.env.DATABASE_URL.startsWith("memory://")) {
    console.log(
      "[asset-worker] PGlite is single-process: the API runs the asset worker embedded when DATABASE_URL is empty. " +
        "Set DATABASE_URL to a Postgres URL to run this worker standalone.",
    );
    return;
  }
  const storageDir = path.resolve(REPO_ROOT, process.env.STORAGE_DIR ?? "./storage");
  const handle = await createDb();
  await migrate(handle.db);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(`[asset-worker] polling IMPORT jobs every 2 s (storage: ${storageDir})`);
  await runAssetWorker(handle.db, storageDir, controller.signal);
  await handle.close();
  console.log("[asset-worker] stopped");
}

// Only run when executed directly (not when imported by tests or the API).
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]).replace(/\\/g, "/"))) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
