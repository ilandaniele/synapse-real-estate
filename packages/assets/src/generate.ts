import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildFloorplanSvg } from "./floorplan";
import { buildMasterplanGlb } from "./glb";
import { buildManifest, PANO_HEIGHT, PANO_WIDTH } from "./manifest";
import { renderJobs, type RenderJob } from "./render-pool";
import { GALLERY, HERO, PANORAMAS } from "./scenes/index";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const outDir = path.resolve(process.env.STORAGE_DIR ?? path.join(repoRoot, "storage"), "demo");

/** Quick-iteration knobs: ASSETS_SCALE divides every image dimension, ASSETS_ONLY filters by slug / file stem. */
const scale = Math.max(1, Number(process.env.ASSETS_SCALE ?? 1) || 1);
const only = (process.env.ASSETS_ONLY ?? "").split(",").filter(Boolean);
const wanted = (id: string): boolean => only.length === 0 || only.includes(id);
const dim = (n: number): number => Math.max(16, Math.round(n / scale));

const PANO_SPP = 4;
const GALLERY_SPP = 4;
const JPEG_QUALITY = 82;

const captionSvg = (width: number, height: number): Buffer => {
  const fs = Math.round(Math.max(11, width / 100));
  const text = "Render demo · Synapse";
  const w = Math.round(fs * 11.5);
  const h = Math.round(fs * 1.9);
  const pad = Math.round(fs * 0.9);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="${width - w - pad}" y="${height - h - pad}" width="${w}" height="${h}" rx="${h / 2}" fill="#000" fill-opacity="0.38"/>` +
      `<text x="${width - w / 2 - pad}" y="${height - pad - h / 2 + fs * 0.35}" text-anchor="middle" font-family="Helvetica, Arial, DejaVu Sans, sans-serif" font-size="${fs}" fill="#fff" fill-opacity="0.92">${text}</text>` +
      `</svg>`,
  );
};

async function save(file: string, data: Buffer | string): Promise<void> {
  const target = path.join(outDir, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

const raw = (rgb: Buffer, width: number, height: number): ReturnType<typeof sharp> => sharp(rgb, { raw: { width, height, channels: 3 } });

async function main(): Promise<void> {
  const t0 = Date.now();
  const lap = (label: string): void => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);
  console.log(`output: ${outDir}`);

  const jobs: RenderJob[] = [];
  const panoW = dim(PANO_WIDTH);
  const panoH = dim(PANO_HEIGHT);
  for (const p of PANORAMAS) {
    if (!wanted(p.slug)) continue;
    jobs.push({ id: `pano:${p.slug}`, sceneKey: p.slug, camera: { kind: "equirect", pos: p.camera }, width: panoW, height: panoH, spp: PANO_SPP });
    jobs.push({
      id: `thumb:${p.slug}`,
      sceneKey: p.slug,
      camera: { kind: "persp", pos: p.camera, yaw: p.initialView.yaw, pitch: p.initialView.pitch, fov: p.initialView.fov },
      width: dim(320),
      height: dim(180),
      spp: 4,
    });
  }
  for (const g of GALLERY) {
    if (!wanted(path.basename(g.file, ".jpg"))) continue;
    jobs.push({ id: `gallery:${g.file}`, sceneKey: g.sceneKey, camera: g.camera, width: dim(g.width), height: dim(g.height), spp: GALLERY_SPP });
  }
  if (wanted("hero")) jobs.push({ id: "hero", sceneKey: HERO.sceneKey, camera: HERO.camera, width: dim(HERO.width), height: dim(HERO.height), spp: GALLERY_SPP });

  await renderJobs(jobs, async ({ job, rgb }) => {
    const [kind, name = ""] = job.id.split(":");
    const img = raw(rgb, job.width, job.height);
    if (kind === "pano") {
      await save(`panoramas/${name}.jpg`, await img.clone().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer());
      await save(`panoramas/${name}-preview.jpg`, await img.clone().resize(dim(1024), dim(512)).jpeg({ quality: 78, mozjpeg: true }).toBuffer());
    } else if (kind === "thumb") {
      await save(`thumbs/${name}.jpg`, await img.jpeg({ quality: 78, mozjpeg: true }).toBuffer());
    } else {
      const file = kind === "gallery" ? name : `${HERO.file}`;
      await save(file, await img.composite([{ input: captionSvg(job.width, job.height) }]).jpeg({ quality: 86, mozjpeg: true }).toBuffer());
    }
    lap(`rendered ${job.id} ${job.width}x${job.height}`);
  });

  const model = await buildMasterplanGlb();
  await save("models/masterplan.glb", Buffer.from(model.glb));
  lap(`masterplan.glb ${(model.glb.byteLength / 1024).toFixed(0)} KB`);

  await save("floorplans/villa-6.svg", buildFloorplanSvg());
  await save("manifest.json", `${JSON.stringify(buildManifest(model, new Date().toISOString()), null, 2)}\n`);
  lap("floorplan + manifest");

  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
