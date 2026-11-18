import { Uuid } from "@synapse/contracts";
import { ReservationRoute, type CheckoutReturn } from "@/components/ReservationFlow";

type SearchParams = Record<string, string | string[] | undefined>;

function checkoutReturn({ reservation, cancelled }: SearchParams): CheckoutReturn | undefined {
  const id = Uuid.safeParse(reservation);
  return id.success ? { reservationId: id.data, cancelled: cancelled === "1" } : undefined;
}

export default async function ReservationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const { slug } = await params;
  return <ReservationRoute slug={slug} returned={checkoutReturn(await searchParams)} />;
}
