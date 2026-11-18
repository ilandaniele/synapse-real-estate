import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { MockPaymentInput, ReservationInput, type ReservationCreated, type ReservationSettings } from "@synapse/contracts";
import { developments, reservations, units } from "@synapse/db";
import { serviceUnavailable } from "../lib/errors";
import { IdParams } from "../lib/params";
import { settleMockPayment, unitNotAvailable } from "../lib/reservations";
import { newToken } from "../lib/tokens";

export interface ReservationRouteOptions {
  createRateLimit: number;
  paymentRateLimit: number;
}

const perMinute = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

export default async function reservationRoutes(app: FastifyInstance, opts: ReservationRouteOptions) {
  const enabled = app.config.paymentProvider !== "none";
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
        status: units.status,
        currency: units.currency,
      })
      .from(units)
      .innerJoin(developments, eq(developments.id, units.developmentId))
      .where(and(eq(units.id, input.unitId), eq(developments.slug, input.developmentSlug)));
    if (!unit || unit.status !== "AVAILABLE") throw unitNotAvailable();

    const { token, tokenHash } = newToken();
    const [created] = await app.db
      .insert(reservations)
      .values({
        organizationId: unit.organizationId,
        developmentId: unit.developmentId,
        unitId: input.unitId,
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone || null,
        depositAmount: app.config.reservationDeposit,
        currency: unit.currency,
        checkoutTokenHash: tokenHash,
        paymentProvider: app.config.paymentProvider,
      })
      .returning({ id: reservations.id });
    const body: ReservationCreated = {
      id: created!.id,
      checkoutToken: token,
      unitCode: unit.code,
      depositAmount: app.config.reservationDeposit,
      currency: unit.currency,
    };
    return reply.status(201).send(body);
  });

  app.post("/:id/mock-payment", { ...perMinute(opts.paymentRateLimit), preHandler: requireProvider }, async (request) => {
    const { id } = IdParams.parse(request.params);
    const { checkoutToken, outcome } = MockPaymentInput.parse(request.body);
    return settleMockPayment(app.db, id, checkoutToken, outcome);
  });
}
