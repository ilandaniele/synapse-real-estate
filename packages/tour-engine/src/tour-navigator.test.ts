import { describe, expect, it } from "vitest";
import { pickInitialScene, TourNavigator } from "./tour-navigator";

const scenes = [
  { id: "b", slug: "living", sortOrder: 2 },
  { id: "a", slug: "exterior", sortOrder: 1 },
  { id: "c", slug: "cocina", sortOrder: 3 },
];

describe("pickInitialScene", () => {
  it("prefers the slug match", () => {
    expect(pickInitialScene(scenes, "cocina")?.id).toBe("c");
  });
  it("falls back to the lowest sortOrder", () => {
    expect(pickInitialScene(scenes)?.id).toBe("a");
    expect(pickInitialScene(scenes, "unknown")?.id).toBe("a");
  });
  it("returns null for no scenes", () => {
    expect(pickInitialScene([])).toBeNull();
  });
});

describe("TourNavigator", () => {
  const ids = new Set(["a", "b", "c"]);

  it("navigates and goes back through history", () => {
    const nav = new TourNavigator(ids, "a");
    expect(nav.goTo("b")).toBe(true);
    expect(nav.goTo("c")).toBe(true);
    expect(nav.currentId).toBe("c");
    expect(nav.canGoBack).toBe(true);
    expect(nav.back()).toBe(true);
    expect(nav.currentId).toBe("b");
    expect(nav.back()).toBe(true);
    expect(nav.currentId).toBe("a");
    expect(nav.canGoBack).toBe(false);
    expect(nav.back()).toBe(false);
  });

  it("ignores unknown ids and the current scene", () => {
    const nav = new TourNavigator(ids, "a");
    expect(nav.goTo("zzz")).toBe(false);
    expect(nav.goTo("a")).toBe(false);
    expect(nav.canGoBack).toBe(false);
  });

  it("setIds keeps history, reset drops it", () => {
    const nav = new TourNavigator(ids, "a");
    nav.goTo("b");
    nav.setIds(new Set(["a", "b", "d"]));
    expect(nav.canGoBack).toBe(true);
    expect(nav.goTo("d")).toBe(true);
    nav.reset(new Set(["x"]), "x");
    expect(nav.currentId).toBe("x");
    expect(nav.canGoBack).toBe(false);
  });
});
