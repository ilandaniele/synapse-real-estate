/// <reference path="./marzipano.d.ts" />
import type * as Marzipano from "marzipano";
import type { Hotspot } from "@synapse/contracts";
import { createHotspotHandle, type HotspotCallbacks, type HotspotHandle } from "./hotspot-dom";
import type { TourStrings } from "./strings";

export interface HotspotEntry {
  hotspot: Marzipano.Hotspot;
  handle: HotspotHandle;
}

/** One Marzipano scene plus the hotspot DOM attached to it. */
export interface SceneRecord {
  sceneId: string;
  mz: Marzipano.Scene;
  hotspots: Map<string, HotspotEntry>;
}

export interface HotspotSyncOptions {
  selectedHotspotId: string | null | undefined;
  editable: boolean;
  callbacks: HotspotCallbacks;
  strings: TourStrings;
}

/** Diffs `desired` against what is mounted in `record`: removes, creates and moves hotspots. */
export function syncHotspots(record: SceneRecord, desired: readonly Hotspot[], options: HotspotSyncOptions): void {
  const container = record.mz.hotspotContainer();
  const wanted = new Set(desired.map((h) => h.id));

  for (const [id, entry] of record.hotspots) {
    if (wanted.has(id)) continue;
    destroyEntry(container, entry);
    record.hotspots.delete(id);
  }

  for (const h of desired) {
    const state = { selected: h.id === options.selectedHotspotId, editable: options.editable, strings: options.strings };
    const existing = record.hotspots.get(h.id);
    if (existing) {
      existing.handle.update(h, state);
      const pos = existing.hotspot.position();
      if (pos.yaw !== h.yaw || pos.pitch !== h.pitch) existing.hotspot.setPosition({ yaw: h.yaw, pitch: h.pitch });
    } else {
      const handle = createHotspotHandle(h, state, options.callbacks);
      const hotspot = container.createHotspot(handle.element, { yaw: h.yaw, pitch: h.pitch });
      record.hotspots.set(h.id, { hotspot, handle });
    }
  }
}

export function destroyRecordHotspots(record: SceneRecord): void {
  for (const entry of record.hotspots.values()) entry.handle.destroy();
  record.hotspots.clear();
}

function destroyEntry(container: Marzipano.HotspotContainer, entry: HotspotEntry): void {
  if (container.hasHotspot(entry.hotspot)) container.destroyHotspot(entry.hotspot);
  entry.handle.destroy();
}
