import { Box3, Color, Mesh, MeshStandardMaterial, type Material, type Object3D } from "three";
import type { Unit } from "@synapse/contracts";
import { STATUS_META } from "@synapse/domain";
import type { BoxLike, UnitVisual, Vec3 } from "./helpers";

export interface UnitNode {
  unitId: string;
  meshes: Mesh[];
  /** Ground plates (`Villa_0N_Plot`) that get tinted with the commercial status color. */
  plots: Mesh[];
  box: BoxLike;
}

export interface PreparedModel {
  /** Deep clone of the cached GLTF scene with per-mesh cloned materials. */
  root: Object3D;
  units: Map<string, UnitNode>;
  bounds: BoxLike;
  /** Pristine material values, used to restore after highlight/fade. */
  base: Map<Material, MaterialBase>;
  dispose(): void;
}

interface MaterialBase {
  emissive: Color;
  emissiveIntensity: number;
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

const PLOT_PATTERN = /_Plot$/i;
const NO_CAST = /^(Terrain|Road)/i;

const toBox = (box: Box3): BoxLike => ({
  min: [box.min.x, box.min.y, box.min.z] as Vec3,
  max: [box.max.x, box.max.y, box.max.z] as Vec3,
});

export const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/**
 * Clones the cached GLTF scene so that materials are never shared with the cache (or between villas),
 * indexes the meshes owned by each unit and measures bounding boxes.
 */
export function prepareModel(source: Object3D, units: readonly Unit[]): PreparedModel {
  const root = source.clone(true);
  const owned: Material[] = [];
  const base = new Map<Material, MaterialBase>();

  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.material = Array.isArray(child.material) ? child.material.map((m: Material) => m.clone()) : child.material.clone();
    child.castShadow = !NO_CAST.test(child.name);
    child.receiveShadow = true;
    for (const material of materialsOf(child)) {
      owned.push(material);
      if (material instanceof MeshStandardMaterial) {
        base.set(material, {
          emissive: material.emissive.clone(),
          emissiveIntensity: material.emissiveIntensity,
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        });
      } else {
        base.set(material, { emissive: new Color(0), emissiveIntensity: 0, opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
      }
    }
  });

  root.updateMatrixWorld(true);

  const nodes = new Map<string, UnitNode>();
  for (const unit of units) {
    const meshes: Mesh[] = [];
    const box = new Box3();
    for (const name of unit.meshNames) {
      const group = root.getObjectByName(name);
      if (!group) continue;
      box.expandByObject(group);
      group.traverse((c) => {
        if (c instanceof Mesh) meshes.push(c);
      });
    }
    if (meshes.length === 0 || box.isEmpty()) continue;
    nodes.set(unit.id, { unitId: unit.id, meshes, plots: meshes.filter((m) => PLOT_PATTERN.test(m.name)), box: toBox(box) });
  }

  return {
    root,
    units: nodes,
    bounds: toBox(new Box3().setFromObject(root)),
    base,
    dispose() {
      for (const material of owned) material.dispose();
    },
  };
}

/** Applies status tint + highlight/fade to one villa. Mutates only the villa's own cloned materials. */
export function applyUnitVisual(node: UnitNode, status: Unit["status"], visual: UnitVisual, base: Map<Material, MaterialBase>): void {
  const statusColor = new Color(STATUS_META[status].color);
  for (const mesh of node.meshes) {
    const isPlot = node.plots.includes(mesh);
    for (const material of materialsOf(mesh)) {
      const original = base.get(material);
      if (!original) continue;
      const fade = visual.opacity < 1;
      material.opacity = original.opacity * visual.opacity;
      material.transparent = original.transparent || fade;
      material.depthWrite = fade ? false : original.depthWrite;
      if (!(material instanceof MeshStandardMaterial)) continue;
      if (isPlot) material.color.copy(statusColor);
      if (visual.emissiveIntensity > 0) {
        material.emissive.copy(isPlot ? statusColor : new Color("#ffffff"));
        material.emissiveIntensity = visual.emissiveIntensity;
      } else {
        material.emissive.copy(original.emissive);
        material.emissiveIntensity = original.emissiveIntensity;
      }
      material.needsUpdate = true;
    }
  }
}
