"use client";

import { ManifestGate } from "@/components/ManifestGate";
import { MasterplanView } from "@/components/MasterplanView";

export default function MasterplanPage() {
  return <ManifestGate>{(manifest) => <MasterplanView manifest={manifest} />}</ManifestGate>;
}
