import path from "node:path";
import { createDb, migrate } from "@synapse/db";
import { blenderPath } from "./blender";
import { runRenderWorker } from "./loop";

export { NO_RENDER_BACKEND_MESSAGE, processRenderJob } from "./process";
export { blenderPath, type PanoramaRenderer } from "./blender";
export { runRenderWorker } from "./loop";

async function main() {
  if (!process.env.DATABASE_URL?.trim() || process.env.DATABASE_URL.startsWith("memory://")) {
    console.log(
      "[render-worker] PGlite is single-process: the API runs the render worker embedded when BLENDER_PATH is set. " +
        "Set DATABASE_URL to a Postgres URL to run this worker standalone.",
    );
    return;
  }
  const handle = await createDb();
  await migrate(handle.db);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(`[render-worker] polling RENDER jobs every 2 s (Blender: ${blenderPath() ?? "not configured"})`);
  await runRenderWorker(handle.db, controller.signal);
  await handle.close();
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]).replace(/\\/g, "/"))) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
