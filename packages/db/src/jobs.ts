import { and, eq, or, sql } from "drizzle-orm";
import type { JobKind } from "@synapse/domain";
import type { Db } from "./client";
import { importJobs, renderJobs } from "./schema";

export type JobRow = typeof importJobs.$inferSelect;
export type JobLog = JobRow["logs"][number];

/** Jobs stuck in PROCESSING longer than this are considered abandoned and can be reclaimed. */
const STALE_LOCK_MS = 10 * 60_000;

export function jobTable(kind: JobKind) {
  return kind === "IMPORT" ? importJobs : renderJobs;
}

/**
 * Atomically claims the next runnable job: PENDING and due, or PROCESSING with a stale lock.
 * Uses FOR UPDATE SKIP LOCKED so several workers never claim the same row.
 */
export async function claimJob(db: Db, kind: JobKind): Promise<JobRow | null> {
  const t = jobTable(kind);
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const rows = await db
    .update(t)
    .set({ status: "PROCESSING", lockedAt: new Date(), attempts: sql`${t.attempts} + 1`, updatedAt: new Date() })
    .where(
      and(
        or(eq(t.status, "PENDING"), eq(t.status, "PROCESSING")),
        eq(
          t.id,
          sql`(select id from ${t}
            where (status = 'PENDING' and run_after <= now())
               or (status = 'PROCESSING' and locked_at < ${staleBefore.toISOString()}::timestamptz)
            order by run_after, created_at
            limit 1
            for update skip locked)`,
        ),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function appendJobLog(db: Db, kind: JobKind, jobId: string, level: JobLog["level"], message: string) {
  const t = jobTable(kind);
  const entry: JobLog = { at: new Date().toISOString(), level, message };
  await db
    .update(t)
    .set({ logs: sql`${t.logs} || ${JSON.stringify([entry])}::jsonb` })
    .where(eq(t.id, jobId));
}
