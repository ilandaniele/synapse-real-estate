"""Renders equirectangular panoramas of a GLB with Cycles.

Run through Blender, never imported:
    blender --background --factory-startup --python-exit-code 1 --python render_panorama.py -- \
        --input scene.glb --output-dir out/ --width 4096 --samples 128 --device OPTIX

Viewpoints are the objects whose name starts with PANO_ (for example an empty called PANO_living).
Without markers it renders one "overview" view above the centre of the model.
Each finished image is announced on stdout as: SYNAPSE_OUTPUT {"slug": ..., "file": ..., "seconds": ...}
"""

import argparse
import json
import math
import os
import re
import sys
import time

import bpy
from mathutils import Vector

MARKER_PREFIX = "PANO_"
GPU_DEVICES = ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL")


def emit(kind, payload):
    text = json.dumps(payload) if isinstance(payload, dict) else payload
    print(f"SYNAPSE_{kind} {text}", flush=True)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--width", type=int, default=4096)
    parser.add_argument("--samples", type=int, default=128)
    parser.add_argument("--device", default="OPTIX", choices=GPU_DEVICES + ("CPU",))
    parser.add_argument("--eye-height", type=float, default=1.6)
    parser.add_argument("--overview-height", type=float, default=None)
    parser.add_argument("--max-views", type=int, default=24)
    parser.add_argument("--hdri", default=None)
    return parser.parse_args(argv)


def slugify(name, used):
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "view"
    candidate, index = slug, 2
    while candidate in used:
        candidate, index = f"{slug}-{index}", index + 1
    used.add(candidate)
    return candidate


def import_scene(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    return bpy.context.scene


def mesh_bounds(scene):
    corners = [
        obj.matrix_world @ Vector(corner)
        for obj in scene.objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    if not corners:
        raise RuntimeError("The GLB has no meshes to render")
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return low, high


def viewpoints(scene, args):
    used = set()
    markers = sorted((o for o in scene.objects if o.name.upper().startswith(MARKER_PREFIX)), key=lambda o: o.name)
    if markers:
        return [
            (slugify(o.name[len(MARKER_PREFIX):], used), o.matrix_world.translation.copy(), o.matrix_world.to_euler().z)
            for o in markers[: args.max_views]
        ]
    low, high = mesh_bounds(scene)
    height = args.overview_height if args.overview_height is not None else args.eye_height
    centre = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z + height))
    return [(slugify("overview", used), centre, 0.0)]


def configure_device(scene, device):
    scene.render.engine = "CYCLES"
    if device == "CPU":
        scene.cycles.device = "CPU"
        return ["CPU"]
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = device
    prefs.get_devices()
    enabled = []
    for entry in prefs.devices:
        entry.use = entry.type == device
        if entry.use:
            enabled.append(entry.name)
    if not enabled:
        raise RuntimeError(f"No {device} device available; use --device CPU or another backend")
    scene.cycles.device = "GPU"
    return enabled


def configure_render(scene, args):
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPTIX" if args.device == "OPTIX" else "OPENIMAGEDENOISE"
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.width // 2
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 90
    scene.view_settings.view_transform = "AgX"


def add_sky(scene, hdri):
    world = bpy.data.worlds.new("synapse-sky")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    background = nodes["Background"]
    if hdri:
        sky = nodes.new("ShaderNodeTexEnvironment")
        sky.image = bpy.data.images.load(hdri, check_existing=True)
        background.inputs["Strength"].default_value = 1.0
    else:
        sky = nodes.new("ShaderNodeTexSky")
        sky.sky_type = "NISHITA"
        sky.sun_elevation = math.radians(35)
        sky.sun_rotation = math.radians(140)
        background.inputs["Strength"].default_value = 0.12
    world.node_tree.links.new(sky.outputs["Color"], background.inputs["Color"])
    scene.world = world


def add_camera(scene):
    data = bpy.data.cameras.new("synapse-pano")
    data.type = "PANO"
    data.panorama_type = "EQUIRECTANGULAR"
    camera = bpy.data.objects.new("synapse-pano", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def render_views(scene, camera, views, output_dir):
    output_dir = os.path.abspath(output_dir)
    os.makedirs(output_dir, exist_ok=True)
    for slug, location, yaw in views:
        camera.location = location
        camera.rotation_euler = (math.radians(90), 0.0, yaw)
        file_path = os.path.join(output_dir, f"{slug}.jpg")
        scene.render.filepath = file_path
        started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        emit("OUTPUT", {"slug": slug, "file": file_path, "seconds": round(time.perf_counter() - started, 2)})


def main():
    args = parse_args()
    scene = import_scene(args.input)
    devices = configure_device(scene, args.device)
    emit("INFO", f"Blender {bpy.app.version_string}, Cycles on {args.device}: {', '.join(devices)}")
    configure_render(scene, args)
    add_sky(scene, args.hdri)
    views = viewpoints(scene, args)
    emit("INFO", f"{len(views)} viewpoint(s) at {args.width}x{args.width // 2}, {args.samples} samples")
    render_views(scene, add_camera(scene), views, args.output_dir)


try:
    main()
except Exception as error:
    emit("ERROR", str(error))
    raise
