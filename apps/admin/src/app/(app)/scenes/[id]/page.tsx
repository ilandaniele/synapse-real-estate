"use client";

import { useParams } from "next/navigation";
import { HotspotEditor } from "@/components/HotspotEditor";

export default function SceneEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <HotspotEditor sceneId={id} />;
}
