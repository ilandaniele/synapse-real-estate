"use client";

import Link from "next/link";
import { Spinner } from "@synapse/ui";
import { useI18n } from "@/i18n/I18nProvider";
import { useReservationProgress } from "@/lib/reservations";

const NOTICE = "rounded-md border p-3 text-sm";

export function ReservationPaid({ unitCode }: { unitCode: string }) {
  const { t } = useI18n();
  return (
    <div role="status" data-testid="reservation-paid" className="text-emerald-900">
      <p className="text-lg font-semibold">{t.reservation.paidTitle(unitCode)}</p>
      <p className="mt-1 text-sm">{t.reservation.paidText}</p>
    </div>
  );
}

/** What the buyer sees when Stripe Checkout sends them back to the unit's reservation page. */
export function ReservationReturn({ reservationId, cancelled, retryHref }: { reservationId: string; cancelled: boolean; retryHref: string }) {
  const { t } = useI18n();
  const { progress, waiting } = useReservationProgress(reservationId);
  const retry = (
    <Link href={retryHref} data-testid="reservation-retry" className="mt-3 inline-flex min-h-11 items-center font-semibold underline">
      {t.reservation.retry}
    </Link>
  );

  if (cancelled) {
    return (
      <div role="status" data-testid="reservation-cancelled" className={`${NOTICE} border-slate-300 bg-slate-50 text-slate-800`}>
        <p>{t.reservation.cancelled}</p>
        {retry}
      </div>
    );
  }
  if (progress?.status === "PAID") return <ReservationPaid unitCode={progress.unitCode} />;
  if (progress?.status === "FAILED") {
    return (
      <div role="alert" data-testid="reservation-error" className={`${NOTICE} border-red-300 bg-red-50 text-red-800`}>
        <p>{t.reservation.paymentFailed}</p>
        {retry}
      </div>
    );
  }
  if (waiting) return <Spinner label={t.reservation.confirming} />;
  return (
    <p role="status" data-testid="reservation-pending" className={`${NOTICE} border-amber-300 bg-amber-50 text-amber-900`}>
      {t.reservation.stillPending}
    </p>
  );
}
