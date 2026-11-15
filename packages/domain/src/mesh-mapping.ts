export interface UnitMeshMappingLike {
  unitId: string;
  meshNames: readonly string[];
}

export function buildMeshIndex(mappings: readonly UnitMeshMappingLike[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const mapping of mappings) {
    for (const name of mapping.meshNames) {
      const owner = index.get(name);
      if (owner && owner !== mapping.unitId) {
        throw new Error(`Mesh "${name}" is mapped to both ${owner} and ${mapping.unitId}`);
      }
      index.set(name, mapping.unitId);
    }
  }
  return index;
}

export interface NamedNode {
  name: string;
  parent: NamedNode | null;
}

export function resolveUnitId(node: NamedNode | null, index: ReadonlyMap<string, string>): string | null {
  for (let current = node; current; current = current.parent) {
    const unitId = index.get(current.name);
    if (unitId) return unitId;
  }
  return null;
}

export function findUnmappedMeshes(meshNames: readonly string[], mappings: readonly UnitMeshMappingLike[]): string[] {
  const mapped = new Set(mappings.flatMap((m) => m.meshNames));
  return meshNames.filter((n) => !mapped.has(n));
}
