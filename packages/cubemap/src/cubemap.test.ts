import { createRequire } from "node:module";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { FACES, buildCubeTiles, cubeLevels, equirectCoords, faceDirection, projectFace, type RgbImage } from "./index";

const require = createRequire(import.meta.url);
const CubeGeometry = require("marzipano/src/geometries/Cube.js");

describe("faceDirection", () => {
  it("matches the vertices Marzipano draws for every cube tile", () => {
    const geometry = new CubeGeometry([{ tileSize: 256, size: 512 }]);
    for (const face of FACES) {
      for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
          const tile = new CubeGeometry.Tile(face, x, y, 0, geometry);
          const [topLeft, , bottomRight] = tile.vertices() as Float32Array[];
          const left = x / 2 - 0.5;
          const top = 0.5 - y / 2;
          expect(faceDirection(face, left, top).map((v) => +v.toFixed(5))).toEqual([...topLeft!].map((v) => +v.toFixed(5)));
          expect(faceDirection(face, left + 0.5, top - 0.5).map((v) => +v.toFixed(5))).toEqual([...bottomRight!].map((v) => +v.toFixed(5)));
        }
      }
    }
  });
});

describe("equirectCoords", () => {
  it("puts the front face at the image centre and up at the top row", () => {
    expect(equirectCoords(faceDirection("f", 0, 0))).toEqual({ s: 0.5, t: 0.5 });
    expect(equirectCoords(faceDirection("u", 0, 0)).t).toBeCloseTo(0);
    expect(equirectCoords(faceDirection("r", 0, 0)).s).toBeCloseTo(0.75);
    expect(equirectCoords(faceDirection("l", 0, 0)).s).toBeCloseTo(0.25);
  });
});

describe("cubeLevels", () => {
  it("doubles from 512 up to the source resolution", () => {
    expect(cubeLevels(1024)).toEqual([512]);
    expect(cubeLevels(4096)).toEqual([512, 1024]);
    expect(cubeLevels(8192)).toEqual([512, 1024, 2048]);
    expect(cubeLevels(40000)).toEqual([512, 1024, 2048, 4096]);
  });
});

/** Equirect image whose colour encodes the quarter of longitude: left, front, right, back. */
function quadrants(width: number, height: number): RgbImage {
  const colours = [[0, 0, 255], [255, 0, 0], [0, 255, 0], [255, 255, 0]];
  const data = new Uint8Array(width * height * 3);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const s = (px + 0.5) / width;
      const colour = py < height / 8 ? [255, 255, 255] : colours[Math.floor(((s + 0.875) % 1) * 4)]!;
      data.set(colour, (py * width + px) * 3);
    }
  }
  return { data, width, height };
}

const centre = (face: RgbImage) => [...face.data.subarray(((face.height / 2) * face.width + face.width / 2) * 3).slice(0, 3)];

describe("projectFace", () => {
  it("samples each face from its own direction", () => {
    const source = quadrants(1024, 512);
    expect(centre(projectFace(source, "f", 64))).toEqual([255, 0, 0]);
    expect(centre(projectFace(source, "r", 64))).toEqual([0, 255, 0]);
    expect(centre(projectFace(source, "b", 64))).toEqual([255, 255, 0]);
    expect(centre(projectFace(source, "l", 64))).toEqual([0, 0, 255]);
    expect(centre(projectFace(source, "u", 64))).toEqual([255, 255, 255]);
  });
});

describe("buildCubeTiles", () => {
  it("writes every tile of every level and a six-face preview strip", async () => {
    const files = new Map<string, Buffer>();
    const result = await buildCubeTiles(quadrants(4096, 2048), async (key, data) => void files.set(key, data));

    expect(result).toEqual({ tileSize: 512, faceSizes: [512, 1024] });
    expect(files.size).toBe(6 * 1 + 6 * 4 + 1);
    expect(files.has("1/f/0/0.jpg")).toBe(true);
    expect(files.has("2/d/1/1.jpg")).toBe(true);

    const tile = await sharp(files.get("2/r/0/0.jpg")).metadata();
    expect([tile.width, tile.height]).toEqual([512, 512]);
    const preview = await sharp(files.get("preview.jpg")).metadata();
    expect([preview.width, preview.height]).toEqual([256, 256 * 6]);
  });
});
