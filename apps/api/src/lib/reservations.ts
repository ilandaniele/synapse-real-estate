import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { reservations, unitAvailabilityHistory, units, type Db } from "@synapse/db";
import { conflict, HttpError, notFound } from "./errors";
import { hashToken } from "./tokens";

export type PaymentOutcome = "approve" | "decline";

const paymentDeclined = () => new HttpError(402, "PAYMENT_DECLINED", "The payment was declined");
export const unitNotAvailable = () => conflict("This unit is no longer available", "UNIT_NOT_AVAILABLE");
const mockPaymentRef = () => `mock_${randomBytes(9).toString("base64url")}`;

/**
 * Settles a pending reservation with the mock provider. An approved payment reserves the unit only if it is
 * still AVAILABLE, in the same transaction; otherwise the reservation fails and the visitor gets 409.
 * A declined payment leaves the reservation pending so the visitor can retry.
 */
export async function settleMockPayment(db: Db, reservationId: string, checkoutToken: string, outcome: PaymentOutcome) {
  const pending = and(
    eq(reservations.id, reservationId),
    eq(reservations.checkoutTokenHash, hashToken(checkoutToken)),
    eq(reservations.status, "PENDING"),
  );
  if (outcome === "decline") {
    const [found] = await db.select({ id: reservations.id }).from(reservations).where(pending);
    if (!found) throw notFound("Pending reservation");
    throw paymentDeclined();
  }

  const paymentRef = mockPaymentRef();
  const result = await db.transaction(async (tx) => {
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

  if (result === "missing") throw notFound("Pending reservation");
  if (result === "unavailable") throw unitNotAvailable();
  return { status: "PAID" as const, paymentRef };
}
