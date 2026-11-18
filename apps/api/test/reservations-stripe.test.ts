import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ReservationCreated, ReservationProgress } from "@synapse/contracts";
import { reservations, unitAvailabilityHistory, units } from "@synapse/db";
import { loadConfig } from "../src/config";
import { stripeGateway, stripeSignatureHeader, verifyStripeEvent, StripeSignatureError, type CheckoutRequest, type PaymentGateway } from "../src/lib/stripe";
import { createTestContext, type TestContext } from "./helpers";

const BASE = "/api/v1/public/reservations";
const WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";
const STRIPE = { secretKey: "sk_test_dummy", webhookSecret: WEBHOOK_SECRET, apiUrl: "http://stripe.invalid" };

const requests: CheckoutRequest[] = [];
let failCheckout = false;
const fakeGateway: PaymentGateway = {
  async createCheckout(request) {
    if (failCheckout) throw new Error("stripe down");
    requests.push(request);
    return { sessionId: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" };
  },
};

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext({
    config: { paymentProvider: "stripe", stripe: STRIPE, showroomPublicUrl: "https://showroom.example.test" },
    paymentGateway: fakeGateway,
  });
});
afterAll(() => ctx.close());
beforeEach(async () => {
  requests.length = 0;
  failCheckout = false;
  await ctx.db.delete(reservations);
  await ctx.db.delete(unitAvailabilityHistory);
  await ctx.db.update(units).set({ status: "AVAILABLE" }).where(eq(units.id, ctx.fx.unitA1));
});

const reserve = () =>
  ctx.app.inject({
    method: "POST",
    url: BASE,
    payload: { developmentSlug: "dev-a", unitId: ctx.fx.unitA1, name: "Carla", email: "Carla@Example.com", consent: true },
  });

async function startReservation() {
  const res = await reserve();
  expect(res.statusCode).toBe(201);
  return ReservationCreated.parse(res.json());
}

const sessionEvent = (type: string, reservationId: string, paymentStatus = "paid") => ({
  id: `evt_${type}`,
  type,
  data: { object: { id: "cs_test_1", payment_status: paymentStatus, payment_intent: "pi_test_1", metadata: { reservationId } } },
});

function sendWebhook(event: unknown, signature?: string) {
  const payload = Buffer.from(JSON.stringify(event));
  return ctx.app.inject({
    method: "POST",
    url: `${BASE}/stripe/webhook`,
    headers: { "content-type": "application/json", "stripe-signature": signature ?? stripeSignatureHeader(WEBHOOK_SECRET, payload) },
    payload,
  });
}

const status = (id: string, token: string) => ctx.app.inject({ method: "GET", url: `${BASE}/${id}/status`, headers: { "x-checkout-token": token } });
const unitStatus = async () => (await ctx.db.select({ status: units.status }).from(units).where(eq(units.id, ctx.fx.unitA1)))[0]!.status;
const reservationStatus = async (id: string) =>
  (await ctx.db.select({ status: reservations.status }).from(reservations).where(eq(reservations.id, id)))[0]!.status;

describe("Stripe signature", () => {
  const body = Buffer.from('{"id":"evt_1","type":"ping","data":{"object":{"id":"x"}}}');
  const now = 1_800_000_000_000;
  const header = stripeSignatureHeader(WEBHOOK_SECRET, body, now / 1000);

  it("accepts a valid signature", () => {
    expect(verifyStripeEvent(body, header, WEBHOOK_SECRET, now).id).toBe("evt_1");
  });

  it("rejects a wrong secret, a tampered body, an old timestamp and a malformed header", () => {
    const tampered = Buffer.from(body.toString().replace("ping", "pong"));
    expect(() => verifyStripeEvent(body, header, "whsec_other", now)).toThrow(StripeSignatureError);
    expect(() => verifyStripeEvent(tampered, header, WEBHOOK_SECRET, now)).toThrow(StripeSignatureError);
    expect(() => verifyStripeEvent(body, header, WEBHOOK_SECRET, now + 301_000)).toThrow(StripeSignatureError);
    expect(() => verifyStripeEvent(body, "v1=abc", WEBHOOK_SECRET, now)).toThrow(StripeSignatureError);
    expect(() => verifyStripeEvent(body, undefined, WEBHOOK_SECRET, now)).toThrow(StripeSignatureError);
  });
});

describe("Stripe config", () => {
  const quiet = () => {};
  const prod = { NODE_ENV: "production", SESSION_SECRET: "s".repeat(40), PUBLIC_API_URL: "https://api.example.test", PAYMENT_PROVIDER: "stripe" };

  it("requires the keys and the showroom URL in production", () => {
    expect(() => loadConfig(prod, quiet)).toThrow(/STRIPE_SECRET_KEY/);
    const keys = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" };
    expect(() => loadConfig({ ...prod, ...keys }, quiet)).toThrow(/SHOWROOM_PUBLIC_URL/);
    const config = loadConfig({ ...prod, ...keys, SHOWROOM_PUBLIC_URL: "https://showroom.example.test/" }, quiet);
    expect(config.stripe).toEqual({ secretKey: "sk_test_x", webhookSecret: "whsec_x", apiUrl: "https://api.stripe.com" });
    expect(config.showroomPublicUrl).toBe("https://showroom.example.test");
  });
});

describe("Stripe Checkout reservation", () => {
  it("returns the hosted checkout URL and sends the buyer back to the unit page", async () => {
    const created = await startReservation();
    expect(created.checkoutUrl).toBe("https://checkout.stripe.com/c/pay/cs_test_1");
    const returnUrl = `https://showroom.example.test/reservar/villa-v1?reservation=${created.id}`;
    expect(requests).toEqual([
      {
        reservationId: created.id,
        unitCode: "V1",
        amount: "3000.00",
        currency: "EUR",
        customerEmail: "carla@example.com",
        successUrl: returnUrl,
        cancelUrl: `${returnUrl}&cancelled=1`,
      },
    ]);
    expect(await reservationStatus(created.id)).toBe("PENDING");
  });

  it("marks the reservation failed and answers 502 when Stripe is down", async () => {
    failCheckout = true;
    const res = await reserve();
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe("PAYMENT_PROVIDER_ERROR");
    const [row] = await ctx.db.select({ status: reservations.status }).from(reservations);
    expect(row!.status).toBe("FAILED");
  });

  it("does not offer the mock payment step", async () => {
    const created = await startReservation();
    const res = await ctx.app.inject({
      method: "POST",
      url: `${BASE}/${created.id}/mock-payment`,
      payload: { checkoutToken: created.checkoutToken, outcome: "approve" },
    });
    expect(res.statusCode).toBe(503);
  });

  it("settles on a signed checkout.session.completed and ignores replays", async () => {
    const created = await startReservation();
    expect(ReservationProgress.parse((await status(created.id, created.checkoutToken)).json())).toEqual({ status: "PENDING", unitCode: "V1" });

    const event = sessionEvent("checkout.session.completed", created.id);
    expect((await sendWebhook(event)).statusCode).toBe(200);
    expect((await sendWebhook(event)).statusCode).toBe(200);

    expect((await status(created.id, created.checkoutToken)).json()).toEqual({ status: "PAID", unitCode: "V1" });
    expect(await unitStatus()).toBe("RESERVED");
    const [row] = await ctx.db.select().from(reservations).where(eq(reservations.id, created.id));
    expect(row).toMatchObject({ paymentRef: "pi_test_1", paymentProvider: "stripe" });
    expect(await ctx.db.select().from(unitAvailabilityHistory)).toHaveLength(1);
  });

  it("waits for async payments and fails expired sessions", async () => {
    const created = await startReservation();
    await sendWebhook(sessionEvent("checkout.session.completed", created.id, "unpaid"));
    expect(await reservationStatus(created.id)).toBe("PENDING");
    await sendWebhook(sessionEvent("checkout.session.expired", created.id, "unpaid"));
    expect(await reservationStatus(created.id)).toBe("FAILED");
    expect(await unitStatus()).toBe("AVAILABLE");
  });

  it("fails the reservation when the unit was taken before the payment landed", async () => {
    const created = await startReservation();
    await ctx.db.update(units).set({ status: "SOLD" }).where(eq(units.id, ctx.fx.unitA1));
    expect((await sendWebhook(sessionEvent("checkout.session.completed", created.id))).statusCode).toBe(200);
    expect(await reservationStatus(created.id)).toBe("FAILED");
    expect(await unitStatus()).toBe("SOLD");
  });

  it("rejects unsigned or forged webhooks without touching data", async () => {
    const created = await startReservation();
    const event = sessionEvent("checkout.session.completed", created.id);
    const forged = stripeSignatureHeader("whsec_attacker", Buffer.from(JSON.stringify(event)));
    expect((await sendWebhook(event, "t=1,v1=00")).statusCode).toBe(400);
    expect((await sendWebhook(event, forged)).statusCode).toBe(400);
    expect(await reservationStatus(created.id)).toBe("PENDING");
  });

  it("ignores events without a valid reservation id", async () => {
    const noMetadata = { id: "evt_x", type: "checkout.session.completed", data: { object: { id: "cs_x", metadata: {} } } };
    expect((await sendWebhook(noMetadata)).statusCode).toBe(200);
    expect((await sendWebhook(sessionEvent("checkout.session.completed", "not-a-uuid"))).statusCode).toBe(200);
  });

  it("hides the status from anyone without the checkout token", async () => {
    const created = await startReservation();
    expect((await status(created.id, "x".repeat(43))).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: "GET", url: `${BASE}/${created.id}/status` })).statusCode).toBe(404);
  });
});

describe.skipIf(!process.env.STRIPE_MOCK_URL)("stripeGateway against stripe-mock", () => {
  const checkout = (overrides: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
    reservationId: "6f1c2b9e-1d2a-4c3b-9a8e-0f1e2d3c4b5a",
    unitCode: "V1",
    amount: "3000.00",
    currency: "EUR",
    customerEmail: "carla@example.com",
    successUrl: "https://showroom.example.test/reservar/villa-1?reservation=1",
    cancelUrl: "https://showroom.example.test/reservar/villa-1?reservation=1&cancelled=1",
    ...overrides,
  });

  it("creates a Checkout session that the Stripe API accepts", async () => {
    const session = await stripeGateway(process.env.STRIPE_MOCK_URL!, "sk_test_123").createCheckout(checkout());
    expect(session.sessionId).toMatch(/^cs_/);
    expect(session.url).toMatch(/^https:\/\//);
  });

  it("surfaces a rejected request as an error", async () => {
    await expect(stripeGateway(process.env.STRIPE_MOCK_URL!, "").createCheckout(checkout())).rejects.toThrow(/401/);
  });
});
