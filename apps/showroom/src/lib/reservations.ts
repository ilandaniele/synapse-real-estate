import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, ReservationCreated, ReservationProgress, ReservationSettings, type MockPaymentInput, type ReservationInput } from "@synapse/contracts";
import { RESERVATIONS_URL } from "./config";

/** API error code (or "offline" / "unknown") that the reservation flow turns into a message. */
export class ReservationError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
  ) {
    super(code);
  }
}

async function post(url: string, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ReservationError("offline");
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return json;
  const error = ApiError.safeParse(json);
  throw new ReservationError(res.status === 429 ? "TOO_MANY" : error.success ? error.data.error.code : "unknown", res.status);
}

export async function startReservation(input: ReservationInput): Promise<ReservationCreated> {
  return ReservationCreated.parse(await post(RESERVATIONS_URL, input));
}

export async function payDeposit(reservationId: string, payment: MockPaymentInput): Promise<void> {
  await post(`${RESERVATIONS_URL}/${reservationId}/mock-payment`, payment);
}

const tokenKey = (reservationId: string) => `reservation:${reservationId}`;

/** Keeps the checkout token across the round trip to the hosted payment page, then leaves the page. */
export function redirectToCheckout(reservation: ReservationCreated, checkoutUrl: string) {
  sessionStorage.setItem(tokenKey(reservation.id), reservation.checkoutToken);
  window.location.assign(checkoutUrl);
}

const STATUS_POLL_MS = 2000;
const STATUS_POLL_WINDOW_MS = 30_000;

/**
 * Polls the reservation status after the buyer returns from Stripe until it settles or the attempts run out.
 * `waiting` is true while an answer may still arrive; without the token (another tab) it is false at once.
 */
export function useReservationProgress(reservationId: string) {
  const token = typeof window === "undefined" ? null : sessionStorage.getItem(tokenKey(reservationId));
  const [startedAt] = useState(() => Date.now());
  const stillPolling = (status: string | undefined) => status === "PENDING" && Date.now() - startedAt < STATUS_POLL_WINDOW_MS;
  const progress = useQuery({
    queryKey: ["reservation-progress", reservationId],
    enabled: Boolean(token),
    retry: false,
    queryFn: async ({ signal }) => {
      const res = await fetch(`${RESERVATIONS_URL}/${reservationId}/status`, { signal, headers: { "x-checkout-token": token! } });
      if (!res.ok) throw new ReservationError(res.status === 404 ? "NOT_FOUND" : "unknown", res.status);
      return ReservationProgress.parse(await res.json());
    },
    refetchInterval: (query) => (stillPolling(query.state.data?.status) ? STATUS_POLL_MS : false),
  });
  const waiting = progress.isLoading || stillPolling(progress.data?.status);
  return { progress: progress.data, waiting };
}

async function fetchReservationSettings(signal: AbortSignal): Promise<ReservationSettings> {
  const res = await fetch(`${RESERVATIONS_URL}/settings`, { signal });
  if (!res.ok) throw new Error(`settings ${res.status}`);
  return ReservationSettings.parse(await res.json());
}

/** Reservations are offered only when the API has a payment provider; any failure hides the offer. */
export function useReservationSettings() {
  return useQuery({ queryKey: ["reservation-settings"], queryFn: ({ signal }) => fetchReservationSettings(signal), staleTime: 5 * 60_000 });
}
