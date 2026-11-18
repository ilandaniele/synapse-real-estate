import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { webhookDeliveries, webhookEndpoints } from "./schema";

/** How long a claimed delivery stays hidden from other workers while it is being sent. */
const DELIVERY_LEASE_MS = 60_000;

export type ClaimedWebhookDelivery = typeof webhookDeliveries.$inferSelect & { url: string; secret: string };

/**
 * Atomically claims the next due PENDING delivery with its endpoint. The claim pushes `next_attempt_at` forward as a
 * lease, so a crashed worker's delivery is retried later; FOR UPDATE SKIP LOCKED keeps workers off the same row.
 */
export async function claimWebhookDelivery(db: Db): Promise<ClaimedWebhookDelivery | null> {
  const leaseUntil = new Date(Date.now() + DELIVERY_LEASE_MS);
  const [delivery] = await db
    .update(webhookDeliveries)
    .set({ nextAttemptAt: leaseUntil, attempts: sql`${webhookDeliveries.attempts} + 1` })
    .where(
      eq(
        webhookDeliveries.id,
        sql`(select id from ${webhookDeliveries}
          where status = 'PENDING' and next_attempt_at <= now()
          order by next_attempt_at
          limit 1
          for update skip locked)`,
      ),
    )
    .returning();
  if (!delivery) return null;
  const [endpoint] = await db
    .select({ url: webhookEndpoints.url, secret: webhookEndpoints.secret })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.id, delivery.endpointId));
  return endpoint ? { ...delivery, ...endpoint } : null;
}
