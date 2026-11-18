import { describe, expect, it } from "vitest";
import { cubeEquivalentWidth, cubeLevelList } from "./panorama-source";

const cubeMap = { baseUrl: "/media/x-tiles", tileSize: 512, faceSizes: [512, 1024, 2048] };

describe("cubeLevelList", () => {
  it("puts the preview strip first as a fallback-only level, then one level per face size", () => {
    expect(cubeLevelList(cubeMap)).toEqual([
      { tileSize: 256, size: 256, fallbackOnly: true },
      { tileSize: 512, size: 512 },
      { tileSize: 512, size: 1024 },
      { tileSize: 512, size: 2048 },
    ]);
  });
});

describe("cubeEquivalentWidth", () => {
  it("matches an equirect four faces wide", () => {
    expect(cubeEquivalentWidth(cubeMap)).toBe(8192);
  });
});
