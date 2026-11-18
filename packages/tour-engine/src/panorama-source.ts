import type * as Marzipano from "marzipano";
import type { CubeMapTiles, Scene } from "@synapse/contracts";

const FULL_WIDTH = 4096;
const PREVIEW_WIDTH = 1024;
const CUBE_PREVIEW_FACE_SIZE = 256;

export interface PanoramaSource {
  source: Marzipano.ImageUrlSource;
  geometry: Marzipano.EquirectGeometry | Marzipano.CubeGeometry;
  /** Equirectangular width with the same detail, for the zoom limit. */
  maxResolution: number;
}

/** Cube levels for Marzipano: the preview strip first (level 0, never selected for display), then the tiled levels. */
export function cubeLevelList(cubeMap: CubeMapTiles) {
  return [
    { tileSize: CUBE_PREVIEW_FACE_SIZE, size: CUBE_PREVIEW_FACE_SIZE, fallbackOnly: true },
    ...cubeMap.faceSizes.map((size) => ({ tileSize: Math.min(cubeMap.tileSize, size), size })),
  ];
}

/** A face covers a quarter of the horizon, so four faces match an equirect of that width. */
export const cubeEquivalentWidth = (cubeMap: CubeMapTiles) => 4 * Math.max(...cubeMap.faceSizes);

/** Tiled cube map when the scene has one; otherwise the single equirect image, with its preview as the first level. */
export function createPanoramaSource(mz: typeof Marzipano, scene: Scene): PanoramaSource {
  const { cubeMap, previewUrl, panoramaUrl } = scene;
  if (cubeMap) {
    return {
      source: mz.ImageUrlSource.fromString(`${cubeMap.baseUrl}/{z}/{f}/{y}/{x}.jpg`, { cubeMapPreviewUrl: `${cubeMap.baseUrl}/preview.jpg` }),
      geometry: new mz.CubeGeometry(cubeLevelList(cubeMap)),
      maxResolution: cubeEquivalentWidth(cubeMap),
    };
  }
  const levels = previewUrl ? [{ width: PREVIEW_WIDTH }, { width: FULL_WIDTH }] : [{ width: FULL_WIDTH }];
  return {
    source: new mz.ImageUrlSource((tile) => ({ url: previewUrl && tile.z === 0 ? previewUrl : panoramaUrl })),
    geometry: new mz.EquirectGeometry(levels),
    maxResolution: FULL_WIDTH,
  };
}
