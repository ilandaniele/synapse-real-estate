import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { eq } from "drizzle-orm";
import type { WEBHOOK_EVENTS } from "@synapse/contracts";
import { claimWebhookDelivery, webhookDeliveries, webhookEndpoints, type ClaimedWebhookDelivery, type Db } from "@synapse/db";
import type { Executor } from "./audit";

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const MAX_DELIVERY_ATTEMPTS = 6;
/** Wait after failed attempt n (1-based) before attempt n + 1. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const DELIVERY_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_ERROR_LENGTH = 500;

export const newWebhookSecret = () => `whsec_${randomBytes(24).toString("hex")}`;

/** Same scheme as the docs in WEBHOOKS.md: hex HMAC-SHA256 of `<timestamp>.<raw body>`. */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

/**
 * Queues one delivery per endpoint of the organization, in the caller's transaction. All deliveries share the
 * event id so a receiver can de-duplicate retries.
 */
export async function enqueueWebhookEvent(executor: Executor, organizationId: string, event: WebhookEvent, data: Record<string, unknown>) {
  const envelope = { id: randomUUID(), type: event, createdAt: new Date().toISOString(), data };
  const endpoints = await executor.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(eq(webhookEndpoints.organizationId, organizationId));
  if (endpoints.length === 0) return;
  await executor
    .insert(webhookDeliveries)
    .values(endpoints.map((endpoint) => ({ organizationId, endpointId: endpoint.id, event, payload: envelope })));
}

const privateRanges = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 3],
] as const) {
  privateRanges.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  privateRanges.addSubnet(network, prefix, "ipv6");
}

export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  const ip = mapped ?? address;
  return privateRanges.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");
}

/**
 * In production a webhook must use https and resolve only to public addresses, so an organization cannot make the
 * API call its own network. Outside production local receivers are allowed for development and tests.
 */
export async function assertDeliverableUrl(url: string, isProd: boolean): Promise<void> {
  if (!isProd) return;
  const { protocol, hostname } = new URL(url);
  if (protocol !== "https:") throw new Error("Webhook URL must use https");
  const host = hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error("Webhook URL must resolve to a public address");
}

interface DeliveryOptions {
  isProd: boolean;
  fetchImpl?: typeof fetch;
}

async function send(delivery: ClaimedWebhookDelivery, { isProd, fetchImpl = fetch }: DeliveryOptions): Promise<{ status: number | null; error: string | null }> {
  try {
    await assertDeliverableUrl(delivery.url, isProd);
    const body = JSON.stringify(delivery.payload);
    const response = await fetchImpl(delivery.url, {
      method: "POST",
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": "Synapse-Webhooks/1",
        "x-synapse-event": delivery.event,
        "x-synapse-delivery": delivery.id,
        "x-synapse-signature": signWebhook(delivery.secret, Math.floor(Date.now() / 1000), body),
      },
    });
    await response.body?.cancel();
    return { status: response.status, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { status: null, error: (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH) };
  }
}

/** Sends the next due delivery, if any, and records the outcome. Returns false when the queue is empty. */
export async function deliverNextWebhook(db: Db, options: DeliveryOptions): Promise<boolean> {
  const delivery = await claimWebhookDelivery(db);
  if (!delivery) return false;
  const { status, error } = await send(delivery, options);
  const outcome = !error
    ? { status: "DELIVERED" as const, deliveredAt: new Date() }
    : delivery.attempts >= MAX_DELIVERY_ATTEMPTS
      ? { status: "FAILED" as const }
      : { status: "PENDING" as const, nextAttemptAt: new Date(Date.now() + RETRY_DELAYS_MS[delivery.attempts - 1]!) };
  await db
    .update(webhookDeliveries)
    .set({ ...outcome, responseStatus: status, lastError: error })
    .where(eq(webhookDeliveries.id, delivery.id));
  return true;
}

/** Polls the delivery queue until `signal` aborts. SKIP LOCKED makes it safe to run in every API instance. */
export async function runWebhookWorker(db: Db, signal: AbortSignal, isProd: boolean): Promise<void> {
  while (!signal.aborted) {
    try {
      if (await deliverNextWebhook(db, { isProd })) continue;
    } catch (error) {
      console.error("[webhook-worker] loop error", error);
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, POLL_INTERVAL_MS);
      signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
    });
  }
}
