import { UnitSheetRoute } from "@/components/UnitSheet";

export default async function UnitSheetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <UnitSheetRoute slug={slug} />;
}
