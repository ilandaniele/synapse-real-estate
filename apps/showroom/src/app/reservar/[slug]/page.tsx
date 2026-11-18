import { ReservationRoute } from "@/components/ReservationFlow";

export default async function ReservationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ReservationRoute slug={slug} />;
}
