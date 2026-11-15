import { existsSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { claimJob, createDb, migrate, renderJobs, type Db, type JobLog, type JobRow } from "@synapse/db";

export const NO_RENDER_BACKEND_MESSAGE =
  "No render backend configured (Blender CLI not available). See docs/RENDER_PIPELINE.md";

const POLL_INTERVAL_MS = 2_000;

/** Returns the Blender executable when BLENDER_PATH is set and exists, otherwise null. */
export function blenderPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.BLENDER_PATH?.trim();
  return configured && existsSync(configured) ? configured : null;
}

export async function processRenderJob(db: Db, job: JobRow, env: NodeJS.ProcessEnv = process.env): Promise<"FAILED"> {
  const blender = blenderPath(env);
  const logs: JobLog[] = [];
  const at = () => new Date().toISOString();
  let error: string;
  if (!blender) {
    error = NO_RENDER_BACKEND_MESSAGE;
  } else {
    // TODO(render-pipeline): spawn `${blender} --background --python <script> -- <job args>` detached, stream stdout
    // into job.logs and register the output files as assets. Intentionally not implemented: no fake renders.
    error = `Blender found at ${blender} but the render script is not implemented yet. See docs/RENDER_PIPELINE.md`;
  }
  logs.push({ at: at(), level: "error", message: error });
  await db
    .update(renderJobs)
    .set({ status: "FAILED", error, lockedAt: null, logs: sql`${renderJobs.logs} || ${JSON.stringify(logs)}::jsonb` })
    .where(eq(renderJobs.id, job.id));
  return "FAILED";
}

async function main() {
  if (!process.env.DATABASE_URL?.trim() || process.env.DATABASE_URL.startsWith("memory://")) {
    console.log("[render-worker] PGlite is single-process; set DATABASE_URL to a Postgres URL to run this worker.");
    return;
  }
  const handle = await createDb();
  await migrate(handle.db);
  let running = true;
  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log("[render-worker] polling RENDER jobs every 2 s");
  while (running) {
    try {
      const job = await claimJob(handle.db, "RENDER");
      if (job) {
        await processRenderJob(handle.db, job);
        console.log(`[render-worker] job ${job.id} -> FAILED (no render backend)`);
        continue;
      }
    } catch (error) {
      console.error("[render-worker] loop error", error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  await handle.close();
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]).replace(/\\/g, "/"))) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
