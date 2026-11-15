import { TourHistory } from "@synapse/domain";

export interface NavigableScene {
  id: string;
  slug: string;
  sortOrder?: number;
}

/** Scene that matches `initialSlug`, otherwise the first by `sortOrder`, otherwise `null`. */
export function pickInitialScene<T extends NavigableScene>(scenes: readonly T[], initialSlug?: string): T | null {
  if (initialSlug) {
    const match = scenes.find((s) => s.slug === initialSlug);
    if (match) return match;
  }
  const sorted = [...scenes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return sorted[0] ?? null;
}

/**
 * Thin guard around `TourHistory`: ignores navigation to ids that are not part of the tour and
 * lets the owner swap the known scene ids (or rebuild the history) when the scene list changes.
 */
export class TourNavigator {
  private history: TourHistory;

  constructor(
    private ids: ReadonlySet<string>,
    initialId: string,
  ) {
    this.history = new TourHistory(initialId);
  }

  get currentId(): string {
    return this.history.currentSceneId;
  }

  get canGoBack(): boolean {
    return this.history.canGoBack;
  }

  /** Returns true when the navigator moved. */
  goTo(sceneId: string): boolean {
    if (!this.ids.has(sceneId) || sceneId === this.currentId) return false;
    this.history.go(sceneId);
    return true;
  }

  /** Returns true when the navigator moved. */
  back(): boolean {
    if (!this.history.canGoBack) return false;
    this.history.back();
    return true;
  }

  /** Replaces the known scene ids, keeping history. */
  setIds(ids: ReadonlySet<string>): void {
    this.ids = ids;
  }

  /** Replaces the known scene ids and starts a fresh history at `initialId`. */
  reset(ids: ReadonlySet<string>, initialId: string): void {
    this.ids = ids;
    this.history = new TourHistory(initialId);
  }
}
