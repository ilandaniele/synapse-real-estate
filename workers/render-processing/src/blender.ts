import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { JobLog } from "@synapse/db";

export const RENDER_SCRIPT = fileURLToPath(new URL("../blender/render_panorama.py", import.meta.url));

export const RENDER_DEVICES = ["OPTIX", "CUDA", "HIP", "ONEAPI", "METAL", "CPU"] as const;
export type RenderDevice = (typeof RENDER_DEVICES)[number];

export interface RenderSettings {
  width: number;
  samples: number;
  device: RenderDevice;
  timeoutMs: number;
}

export interface RenderRequest {
  inputFile: string;
  outputDir: string;
  settings: RenderSettings;
}

export interface RenderedView {
  slug: string;
  file: string;
  seconds: number;
}

export type Log = (level: JobLog["level"], message: string) => void;

/** Renders panoramas of one GLB; Blender in production, a fake in tests. */
export type PanoramaRenderer = (request: RenderRequest, log: Log) => Promise<RenderedView[]>;

export type BlenderLine =
  | { type: "output"; view: RenderedView }
  | { type: "log"; level: JobLog["level"]; message: string }
  | null;

/** Returns the Blender executable when BLENDER_PATH is set and exists, otherwise null. */
export function blenderPath(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.BLENDER_PATH?.trim();
  return configured && existsSync(configured) ? configured : null;
}

function boundedInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function renderSettings(env: NodeJS.ProcessEnv = process.env): RenderSettings {
  const device = env.RENDER_DEVICE?.trim().toUpperCase();
  return {
    width: boundedInt(env.RENDER_WIDTH, 4096, 512, 16384),
    samples: boundedInt(env.RENDER_SAMPLES, 128, 1, 4096),
    device: RENDER_DEVICES.find((d) => d === device) ?? "OPTIX",
    timeoutMs: boundedInt(env.RENDER_TIMEOUT_MINUTES, 60, 1, 24 * 60) * 60_000,
  };
}

export function blenderArgs({ inputFile, outputDir, settings }: RenderRequest): string[] {
  return [
    "--background",
    "--factory-startup",
    "--python-exit-code",
    "1",
    "--python",
    RENDER_SCRIPT,
    "--",
    "--input",
    inputFile,
    "--output-dir",
    outputDir,
    "--width",
    String(settings.width),
    "--samples",
    String(settings.samples),
    "--device",
    settings.device,
  ];
}

/** Only the script's SYNAPSE_* lines matter; Blender's own progress output is ignored. */
export function parseBlenderLine(line: string): BlenderLine {
  const match = /^SYNAPSE_(OUTPUT|INFO|ERROR) (.*)$/.exec(line.trim());
  if (!match) return null;
  const [, kind, body] = match;
  if (kind === "INFO") return { type: "log", level: "info", message: body! };
  if (kind === "ERROR") return { type: "log", level: "error", message: body! };
  const view = JSON.parse(body!) as RenderedView;
  return { type: "output", view };
}

export function blenderRenderer(executable: string): PanoramaRenderer {
  return (request, log) =>
    new Promise((resolve, reject) => {
      const child = spawn(executable, blenderArgs(request), { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      const views: RenderedView[] = [];
      const errors: string[] = [];
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, request.settings.timeoutMs);

      createInterface({ input: child.stdout }).on("line", (line) => {
        const parsed = parseBlenderLine(line);
        if (parsed?.type === "output") {
          views.push(parsed.view);
          log("info", `Rendered ${parsed.view.slug} in ${parsed.view.seconds} s`);
        } else if (parsed) {
          log(parsed.level, parsed.message);
          if (parsed.level === "error") errors.push(parsed.message);
        }
      });
      createInterface({ input: child.stderr }).on("line", (line) => errors.push(line));

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) reject(new Error(`Blender timed out after ${request.settings.timeoutMs / 60_000} min`));
        else if (code !== 0) reject(new Error(`Blender exited with code ${code}: ${errors.slice(-3).join(" | ") || "no details"}`));
        else resolve(views);
      });
    });
}
