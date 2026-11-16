import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blenderArgs, parseBlenderLine, RENDER_SCRIPT, renderSettings } from "./blender";

describe("renderSettings", () => {
  it("uses safe defaults", () => {
    expect(renderSettings({})).toEqual({ width: 4096, samples: 128, device: "OPTIX", timeoutMs: 3_600_000, hdri: null });
  });

  it("reads valid overrides and rejects out-of-range or unknown values", () => {
    expect(renderSettings({ RENDER_WIDTH: "2048", RENDER_SAMPLES: "16", RENDER_DEVICE: "cuda", RENDER_TIMEOUT_MINUTES: "5" })).toEqual({
      width: 2048,
      samples: 16,
      device: "CUDA",
      timeoutMs: 300_000,
      hdri: null,
    });
    expect(renderSettings({ RENDER_WIDTH: "99999", RENDER_SAMPLES: "-1", RENDER_DEVICE: "rm -rf", RENDER_TIMEOUT_MINUTES: "x" })).toEqual(
      renderSettings({}),
    );
  });
});

describe("blenderArgs", () => {
  it("runs the bundled script headless with factory settings and passes job values after --", () => {
    const args = blenderArgs({ inputFile: "in.glb", outputDir: "out", settings: renderSettings({}) });
    expect(args.slice(0, 7)).toEqual(["--background", "--factory-startup", "--python-exit-code", "1", "--python", RENDER_SCRIPT, "--"]);
    expect(args.slice(7)).toEqual(["--input", "in.glb", "--output-dir", "out", "--width", "4096", "--samples", "128", "--device", "OPTIX"]);
    expect(existsSync(RENDER_SCRIPT)).toBe(true);
  });

  it("passes an HDRI only when the configured file exists", () => {
    expect(renderSettings({ RENDER_HDRI: "/missing/sky.hdr" }).hdri).toBeNull();
    const settings = renderSettings({ RENDER_HDRI: RENDER_SCRIPT });
    expect(settings.hdri).toBe(RENDER_SCRIPT);
    expect(blenderArgs({ inputFile: "in.glb", outputDir: "out", settings }).slice(-2)).toEqual(["--hdri", RENDER_SCRIPT]);
  });
});

describe("parseBlenderLine", () => {
  it("parses outputs, info and errors and ignores Blender's own output", () => {
    expect(parseBlenderLine('SYNAPSE_OUTPUT {"slug":"living","file":"/t/living.jpg","seconds":12.5}')).toEqual({
      type: "output",
      view: { slug: "living", file: "/t/living.jpg", seconds: 12.5 },
    });
    expect(parseBlenderLine("SYNAPSE_INFO Cycles on OPTIX")).toEqual({ type: "log", level: "info", message: "Cycles on OPTIX" });
    expect(parseBlenderLine("SYNAPSE_ERROR No OPTIX device")).toEqual({ type: "log", level: "error", message: "No OPTIX device" });
    expect(parseBlenderLine("Fra:1 Mem:120M | Sample 64/128")).toBeNull();
  });
});
