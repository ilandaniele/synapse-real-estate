/** PENDING until the deposit is paid; FAILED when the unit was taken before the payment went through. */
export const RESERVATION_STATUSES = ["PENDING", "PAID", "FAILED"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
