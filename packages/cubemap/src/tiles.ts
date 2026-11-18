import sharp from "sharp";
import { FACES, PREVIEW_FACE_ORDER, type Face } from "./faces";
import { projectFace, type RgbImage } from "./project";

export const TILE_SIZE = 512;
export const PREVIEW_FACE_SIZE = 256;
const MIN_FACE_SIZE = 512;
const MAX_FACE_SIZE = 4096;
const JPEG_QUALITY = 82;

/** Layout of a generated cube map, stored next to the panorama. */
export interface CubeTileSet {
  tileSize: number;
  faceSizes: number[];
}

export type WriteFile = (key: string, data: Buffer) => Promise<void>;

/**
 * Face sizes for a panorama of the given width, smallest first. A face covers 90° of the 360° width,
 * so faces larger than width / π would only upscale the source.
 */
export function cubeLevels(equirectWidth: number): number[] {
  const largest = 2 ** Math.floor(Math.log2(equirectWidth / Math.PI));
  const top = Math.min(Math.max(largest, MIN_FACE_SIZE), MAX_FACE_SIZE);
  const sizes: number[] = [];
  for (let size = MIN_FACE_SIZE; size <= top; size *= 2) sizes.push(size);
  return sizes;
}

const rawInput = (image: RgbImage) => ({ raw: { width: image.width, height: image.height, channels: 3 as const } });

const resized = (face: RgbImage, size: number) =>
  sharp(face.data, rawInput(face)).resize(size, size, { kernel: "lanczos3" });

async function writeLevel(face: Face, image: RgbImage, size: number, z: number, write: WriteFile) {
  const tile = Math.min(TILE_SIZE, size);
  const scaled = await resized(image, size).raw().toBuffer();
  const count = size / tile;
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      const jpeg = await sharp(scaled, { raw: { width: size, height: size, channels: 3 } })
        .extract({ left: x * tile, top: y * tile, width: tile, height: tile })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
      await write(`${z}/${face}/${y}/${x}.jpg`, jpeg);
    }
  }
}

async function previewStrip(faces: Map<Face, RgbImage>): Promise<Buffer> {
  const order = [...PREVIEW_FACE_ORDER] as Face[];
  const parts = await Promise.all(order.map((face) => resized(faces.get(face)!, PREVIEW_FACE_SIZE).raw().toBuffer()));
  return sharp(Buffer.concat(parts), { raw: { width: PREVIEW_FACE_SIZE, height: PREVIEW_FACE_SIZE * order.length, channels: 3 } })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

/**
 * Cuts an equirectangular panorama into Marzipano cube tiles: `<z>/<face>/<row>/<col>.jpg`, with z = 1 for the
 * smallest level, and `preview.jpg`, the six faces stacked in `bdflru` order that Marzipano uses as level 0.
 */
export async function buildCubeTiles(source: RgbImage, write: WriteFile): Promise<CubeTileSet> {
  const faceSizes = cubeLevels(source.width);
  const largest = faceSizes[faceSizes.length - 1]!;
  const faces = new Map(FACES.map((face) => [face, projectFace(source, face, largest)] as const));
  for (const [face, image] of faces) {
    for (const [index, size] of faceSizes.entries()) await writeLevel(face, image, size, index + 1, write);
  }
  await write("preview.jpg", await previewStrip(faces));
  return { tileSize: TILE_SIZE, faceSizes };
}

/** Decodes any image sharp reads into raw RGB. */
export async function decodeEquirect(bytes: Buffer): Promise<RgbImage> {
  const { data, info } = await sharp(bytes).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}
