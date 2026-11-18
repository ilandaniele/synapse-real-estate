import { createHmac, timingSafeEqual } from "node:crypto";
import { toMinorUnits } from "@synapse/domain";
import { z } from "zod";

export interface CheckoutRequest {
  reservationId: string;
  unitCode: string;
  amount: string;
  currency: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

export interface PaymentGateway {
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
}

const STRIPE_TIMEOUT_MS = 10_000;
const SIGNATURE_TOLERANCE_S = 300;

const StripeSession = z.object({ id: z.string(), url: z.string().url() });

export class StripeSignatureError extends Error {}

export const StripeEvent = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    object: z.object({
      id: z.string(),
      payment_status: z.string().optional(),
      payment_intent: z.string().nullable().optional(),
      metadata: z.record(z.string(), z.string()).nullable().optional(),
    }),
  }),
});
export type StripeEvent = z.infer<typeof StripeEvent>;

/** Stripe Checkout in payment mode through the REST API (form-encoded, no SDK). */
export function stripeGateway(apiUrl: string, secretKey: string): PaymentGateway {
  return {
    async createCheckout(request) {
      const form = new URLSearchParams({
        mode: "payment",
        customer_email: request.customerEmail,
        client_reference_id: request.reservationId,
        "metadata[reservationId]": request.reservationId,
        "payment_intent_data[metadata][reservationId]": request.reservationId,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": request.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": toMinorUnits(request.amount).toString(),
        "line_items[0][price_data][product_data][name]": `Señal de reserva ${request.unitCode}`,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
      });
      const res = await fetch(`${apiUrl}/v1/checkout/sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Stripe checkout session failed with ${res.status}`);
      const session = StripeSession.parse(await res.json());
      return { sessionId: session.id, url: session.url };
    },
  };
}

function expectedSignature(secret: string, timestamp: string, rawBody: Buffer): Buffer {
  return createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest();
}

/** Signs a payload the way Stripe does; used by tests and by local webhook replays. */
export function stripeSignatureHeader(secret: string, rawBody: Buffer, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${expectedSignature(secret, String(timestamp), rawBody).toString("hex")}`;
}

/** Verifies the `Stripe-Signature` header (HMAC-SHA256 over `t.body`, 5 minute tolerance) and parses the event. */
export function verifyStripeEvent(rawBody: Buffer, header: string | undefined, secret: string, now = Date.now()): StripeEvent {
  const parts = (header ?? "").split(",").map((part) => part.split("=", 2) as [string, string | undefined]);
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => Buffer.from(value ?? "", "hex"));
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) throw new StripeSignatureError("Malformed signature header");
  if (Math.abs(now / 1000 - Number(timestamp)) > SIGNATURE_TOLERANCE_S) throw new StripeSignatureError("Signature timestamp outside tolerance");
  const expected = expectedSignature(secret, timestamp, rawBody);
  if (!signatures.some((candidate) => candidate.length === expected.length && timingSafeEqual(candidate, expected))) {
    throw new StripeSignatureError("Signature mismatch");
  }
  return StripeEvent.parse(JSON.parse(rawBody.toString("utf8")));
}
