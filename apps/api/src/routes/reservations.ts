import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { MockPaymentInput, ReservationInput, type ReservationCreated, type ReservationProgress, type ReservationSettings } from "@synapse/contracts";
import { developments, reservations, units } from "@synapse/db";
import { badRequest, HttpError, notFound, serviceUnavailable } from "../lib/errors";
import { IdParams } from "../lib/params";
import { applyStripeEvent, failReservation, reservationProgress, settleMockPayment, unitNotAvailable } from "../lib/reservations";
import { StripeSignatureError, verifyStripeEvent } from "../lib/stripe";
import { newToken } from "../lib/tokens";

export interface ReservationRouteOptions {
  createRateLimit: number;
  paymentRateLimit: number;
  statusRateLimit: number;
}

const perMinute = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });
const paymentProviderError = () => new HttpError(502, "PAYMENT_PROVIDER_ERROR", "The payment provider is not available");

export default async function reservationRoutes(app: FastifyInstance, opts: ReservationRouteOptions) {
  const provider = app.config.paymentProvider;
  const enabled = provider !== "none";
  const requireProvider = async () => {
    if (!enabled) throw serviceUnavailable("Online reservations are not enabled");
  };

  app.get("/settings", async (): Promise<ReservationSettings> => ({
    enabled,
    depositAmount: enabled ? app.config.reservationDeposit : null,
  }));

  app.post("/", { ...perMinute(opts.createRateLimit), preHandler: requireProvider }, async (request, reply) => {
    const input = ReservationInput.parse(request.body);
    const [unit] = await app.db
      .select({
        organizationId: units.organizationId,
        developmentId: units.developmentId,
        code: units.code,
        slug: units.slug,
        status: units.status,
        currency: units.currency,
      })
      .from(units)
      .innerJoin(developments, eq(developments.id, units.developmentId))
      .where(and(eq(units.id, input.unitId), eq(developments.slug, input.developmentSlug)));
    if (!unit || unit.status !== "AVAILABLE") throw unitNotAvailable();

    const { token, tokenHash } = newToken();
    const email = input.email.toLowerCase();
    const [created] = await app.db
      .insert(reservations)
      .values({
        organizationId: unit.organizationId,
        developmentId: unit.developmentId,
        unitId: input.unitId,
        name: input.name,
        email,
        phone: input.phone || null,
        depositAmount: app.config.reservationDeposit,
        currency: unit.currency,
        checkoutTokenHash: tokenHash,
        paymentProvider: provider,
      })
      .returning({ id: reservations.id });
    const id = created!.id;

    let checkoutUrl: string | null = null;
    if (app.paymentGateway) {
      const returnUrl = `${app.config.showroomPublicUrl}/reservar/${encodeURIComponent(unit.slug)}?reservation=${id}`;
      try {
        const session = await app.paymentGateway.createCheckout({
          reservationId: id,
          unitCode: unit.code,
          amount: app.config.reservationDeposit,
          currency: unit.currency,
          customerEmail: email,
          successUrl: returnUrl,
          cancelUrl: `${returnUrl}&cancelled=1`,
        });
        checkoutUrl = session.url;
      } catch (error) {
        request.log.error({ err: error, reservationId: id }, "payment provider checkout failed");
        await failReservation(app.db, id);
        throw paymentProviderError();
      }
    }

    const body: ReservationCreated = {
      id,
      checkoutToken: token,
      unitCode: unit.code,
      depositAmount: app.config.reservationDeposit,
      currency: unit.currency,
      checkoutUrl,
    };
    return reply.status(201).send(body);
  });

  app.get("/:id/status", { ...perMinute(opts.statusRateLimit), preHandler: requireProvider }, async (request): Promise<ReservationProgress> => {
    const { id } = IdParams.parse(request.params);
    const token = request.headers["x-checkout-token"];
    if (typeof token !== "string" || token.length < 20 || token.length > 100) throw notFound("Reservation");
    return reservationProgress(app.db, id, token);
  });

  const requireMockProvider = async () => {
    if (provider !== "mock") throw serviceUnavailable("Mock payments are not enabled");
  };
  app.post("/:id/mock-payment", { ...perMinute(opts.paymentRateLimit), preHandler: requireMockProvider }, async (request) => {
    const { id } = IdParams.parse(request.params);
    const { checkoutToken, outcome } = MockPaymentInput.parse(request.body);
    return settleMockPayment(app.db, id, checkoutToken, outcome);
  });

  const webhookSecret = app.config.stripe?.webhookSecret;
  if (webhookSecret) {
    await app.register(async (webhook) => {
      webhook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
      webhook.post("/stripe/webhook", async (request) => {
        const signature = request.headers["stripe-signature"];
        let event;
        try {
          event = verifyStripeEvent(request.body as Buffer, typeof signature === "string" ? signature : undefined, webhookSecret);
        } catch (error) {
          if (error instanceof StripeSignatureError || error instanceof SyntaxError) throw badRequest("Invalid webhook signature");
          throw error;
        }
        const result = await applyStripeEvent(app.db, event);
        if (result === "unavailable") request.log.warn({ eventId: event.id }, "paid reservation for a unit taken meanwhile; refund the deposit");
        return { received: true };
      });
    });
  }
}
