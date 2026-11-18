import { useQuery } from "@tanstack/react-query";
import { ApiError, ReservationCreated, ReservationSettings, type MockPaymentInput, type ReservationInput } from "@synapse/contracts";
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

async function fetchReservationSettings(signal: AbortSignal): Promise<ReservationSettings> {
  const res = await fetch(`${RESERVATIONS_URL}/settings`, { signal });
  if (!res.ok) throw new Error(`settings ${res.status}`);
  return ReservationSettings.parse(await res.json());
}

/** Reservations are offered only when the API has a payment provider; any failure hides the offer. */
export function useReservationSettings() {
  return useQuery({ queryKey: ["reservation-settings"], queryFn: ({ signal }) => fetchReservationSettings(signal), staleTime: 5 * 60_000 });
}
