import { mkdir } from "node:fs/promises";
import { createDb, migrate } from "@synapse/db";
import { buildApp } from "./app";
import { loadConfig } from "./config";

async function main() {
  const config = loadConfig();
  await mkdir(config.storageDir, { recursive: true });
  const handle = await createDb(config.databaseUrl);
  await migrate(handle.db);

  const app = await buildApp({ db: handle.db, storageDir: config.storageDir, config, logger: true });

  // PGlite only allows one process on its data dir, so without DATABASE_URL the workers run inside the API.
  const worker = new AbortController();
  const workersDone: Promise<void>[] = [];
  if (handle.driver === "pglite") {
    const { runAssetWorker } = await import("../../../workers/asset-processing/src/loop");
    app.log.info("PGlite mode: asset worker embedded in the API process");
    workersDone.push(runAssetWorker(handle.db, config.storageDir, worker.signal));
    const { blenderPath } = await import("../../../workers/render-processing/src/blender");
    if (blenderPath()) {
      const { runRenderWorker } = await import("../../../workers/render-processing/src/loop");
      app.log.info("PGlite mode: render worker embedded in the API process");
      workersDone.push(runRenderWorker(handle.db, worker.signal));
    }
  }

  const shutdown = async () => {
    worker.abort();
    await Promise.all(workersDone);
    await app.close();
    await handle.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`API docs at ${config.publicApiUrl}/docs (database: ${handle.driver})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
