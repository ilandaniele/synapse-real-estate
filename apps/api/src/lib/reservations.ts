import { randomBytes } from "node:crypto";
import { and, eq, type SQL } from "drizzle-orm";
import { Uuid } from "@synapse/contracts";
import { reservations, unitAvailabilityHistory, units, type Db } from "@synapse/db";
import { conflict, HttpError, notFound } from "./errors";
import { hashToken } from "./tokens";
import type { StripeEvent } from "./stripe";


export type PaymentOutcome = "approve" | "decline";

const paymentDeclined = () => new HttpError(402, "PAYMENT_DECLINED", "The payment was declined");
export const unitNotAvailable = () => conflict("This unit is no longer available", "UNIT_NOT_AVAILABLE");
const mockPaymentRef = () => `mock_${randomBytes(9).toString("base64url")}`;

const pendingReservation = (reservationId: string, ...conditions: SQL[]) =>
  and(eq(reservations.id, reservationId), eq(reservations.status, "PENDING"), ...conditions);

/**
 * Marks a pending reservation PAID and reserves its unit only if it is still AVAILABLE, in one transaction.
 * When the unit was taken first the reservation becomes FAILED. Returns "missing" when nothing is pending.
 */
export async function settleReservation(db: Db, reservationId: string, paymentRef: string, ...conditions: SQL[]) {
  const pending = pendingReservation(reservationId, ...conditions);
  return db.transaction(async (tx) => {
    const [paid] = await tx
      .update(reservations)
      .set({ status: "PAID", paymentRef, paidAt: new Date() })
      .where(pending)
      .returning({ unitId: reservations.unitId, organizationId: reservations.organizationId });
    if (!paid) return "missing" as const;

    const [reserved] = await tx
      .update(units)
      .set({ status: "RESERVED", updatedAt: new Date() })
      .where(and(eq(units.id, paid.unitId), eq(units.status, "AVAILABLE")))
      .returning({ id: units.id });
    if (!reserved) {
      await tx.update(reservations).set({ status: "FAILED", paidAt: null }).where(eq(reservations.id, reservationId));
      return "unavailable" as const;
    }
    await tx.insert(unitAvailabilityHistory).values({
      organizationId: paid.organizationId,
      unitId: paid.unitId,
      fromStatus: "AVAILABLE",
      toStatus: "RESERVED",
      reason: `Reserva online ${paymentRef}`,
      changedBy: null,
    });
    return "paid" as const;
  });
}

/**
 * Settles a pending reservation with the mock provider; the visitor gets 409 when the unit was taken first.
 * A declined payment leaves the reservation pending so the visitor can retry.
 */
export async function settleMockPayment(db: Db, reservationId: string, checkoutToken: string, outcome: PaymentOutcome) {
  const tokenMatches = eq(reservations.checkoutTokenHash, hashToken(checkoutToken));
  if (outcome === "decline") {
    const [found] = await db.select({ id: reservations.id }).from(reservations).where(pendingReservation(reservationId, tokenMatches));
    if (!found) throw notFound("Pending reservation");
    throw paymentDeclined();
  }

  const paymentRef = mockPaymentRef();
  const result = await settleReservation(db, reservationId, paymentRef, tokenMatches);
  if (result === "missing") throw notFound("Pending reservation");
  if (result === "unavailable") throw unitNotAvailable();
  return { status: "PAID" as const, paymentRef };
}

/** Marks a pending reservation FAILED (provider error, expired or failed checkout). */
export async function failReservation(db: Db, reservationId: string) {
  await db.update(reservations).set({ status: "FAILED" }).where(pendingReservation(reservationId));
}

/** Status of a reservation for the visitor holding its checkout token; 404 for any other token. */
export async function reservationProgress(db: Db, reservationId: string, checkoutToken: string) {
  const [found] = await db
    .select({ status: reservations.status, unitCode: units.code })
    .from(reservations)
    .innerJoin(units, eq(units.id, reservations.unitId))
    .where(and(eq(reservations.id, reservationId), eq(reservations.checkoutTokenHash, hashToken(checkoutToken))));
  if (!found) throw notFound("Reservation");
  return found;
}

const SETTLING_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);
const FAILING_EVENTS = new Set(["checkout.session.expired", "checkout.session.async_payment_failed"]);

/**
 * Applies a verified Stripe Checkout event. Replays are harmless because only PENDING reservations change.
 * "unavailable" means the buyer paid for a unit taken meanwhile: the deposit must be refunded from Stripe.
 */
export async function applyStripeEvent(db: Db, event: StripeEvent) {
  const session = event.data.object;
  const reservationId = session.metadata?.reservationId;
  if (!reservationId || !Uuid.safeParse(reservationId).success) return "ignored" as const;
  if (SETTLING_EVENTS.has(event.type) && session.payment_status === "paid") {
    return settleReservation(db, reservationId, session.payment_intent ?? session.id);
  }
  if (FAILING_EVENTS.has(event.type)) {
    await failReservation(db, reservationId);
    return "failed" as const;
  }
  return "ignored" as const;
}
