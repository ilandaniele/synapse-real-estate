export interface TourSceneRef {
  id: string;
}

export interface TourLink {
  sceneId: string;
  targetSceneId: string | null;
}

export interface TourIssue {
  sceneId: string;
  message: string;
}

export function validateTourLinks(scenes: readonly TourSceneRef[], links: readonly TourLink[]): TourIssue[] {
  const ids = new Set(scenes.map((s) => s.id));
  return links.flatMap((link) => {
    if (!ids.has(link.sceneId)) return [{ sceneId: link.sceneId, message: "Origin scene does not exist" }];
    if (link.targetSceneId && !ids.has(link.targetSceneId)) {
      return [{ sceneId: link.sceneId, message: `Target scene ${link.targetSceneId} does not exist` }];
    }
    if (link.targetSceneId === link.sceneId) return [{ sceneId: link.sceneId, message: "Hotspot links to its own scene" }];
    return [];
  });
}

export function neighborSceneIds(sceneId: string, links: readonly TourLink[]): string[] {
  const targets = links.flatMap((l) => (l.sceneId === sceneId && l.targetSceneId ? [l.targetSceneId] : []));
  return [...new Set(targets)];
}

export function reachableSceneIds(startId: string, links: readonly TourLink[]): Set<string> {
  const seen = new Set<string>([startId]);
  const queue = [startId];
  for (let current = queue.shift(); current; current = queue.shift()) {
    for (const next of neighborSceneIds(current, links)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

export class TourHistory {
  private readonly stack: string[] = [];

  constructor(private current: string) {}

  get currentSceneId(): string {
    return this.current;
  }

  get canGoBack(): boolean {
    return this.stack.length > 0;
  }

  go(sceneId: string): void {
    if (sceneId === this.current) return;
    this.stack.push(this.current);
    this.current = sceneId;
  }

  back(): string {
    const previous = this.stack.pop();
    if (previous) this.current = previous;
    return this.current;
  }
}
