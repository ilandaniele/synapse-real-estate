import { TourRoute } from "@/components/TourView";

export default async function TourPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TourRoute slug={slug} />;
}
