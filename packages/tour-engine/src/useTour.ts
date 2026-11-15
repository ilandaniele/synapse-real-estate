"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { Scene } from "@synapse/contracts";
import { pickInitialScene, TourNavigator } from "./tour-navigator";

export interface UseTour {
  /** Current scene, or `null` while the scene list is empty. */
  current: Scene | null;
  goTo: (sceneId: string) => void;
  back: () => void;
  canGoBack: boolean;
  bySlug: ReadonlyMap<string, Scene>;
}

export function useTour(scenes: readonly Scene[], initialSlug?: string): UseTour {
  const byId = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const bySlug = useMemo(() => new Map(scenes.map((s) => [s.slug, s])), [scenes]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [nav] = useState(
    () => new TourNavigator(new Set(scenes.map((s) => s.id)), pickInitialScene(scenes, initialSlug)?.id ?? ""),
  );

  // Scenes can arrive late or change (admin edits): keep the nav consistent.
  useEffect(() => {
    const ids = new Set(byId.keys());
    if (byId.has(nav.currentId)) {
      nav.setIds(ids);
    } else {
      nav.reset(ids, pickInitialScene(scenes, initialSlug)?.id ?? "");
    }
    rerender();
    // `initialSlug` only matters for the first pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId, nav]);

  const goTo = useCallback(
    (sceneId: string) => {
      if (nav.goTo(sceneId)) rerender();
    },
    [nav],
  );
  const back = useCallback(() => {
    if (nav.back()) rerender();
  }, [nav]);

  const current = byId.get(nav.currentId) ?? pickInitialScene(scenes, initialSlug);
  return { current, goTo, back, canGoBack: nav.canGoBack, bySlug };
}
