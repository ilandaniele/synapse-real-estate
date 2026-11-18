import type { DevelopmentManifest, EntityChange, FieldChange, PublicationDiffSection } from "@synapse/contracts";

type Entity = { id: string } & Record<string, unknown>;

const IGNORED_FIELDS = new Set(["id", "developmentId", "createdAt", "updatedAt"]);

function entityLabel(entity: Entity): string {
  const label = entity.name ?? entity.title ?? entity.code;
  return typeof label === "string" ? label : entity.id;
}

function fieldChanges(before: Entity, after: Entity): FieldChange[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...fields]
    .filter((field) => !IGNORED_FIELDS.has(field))
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
}

function diffSection(section: PublicationDiffSection, before: readonly Entity[], after: readonly Entity[]): EntityChange[] {
  const beforeById = new Map(before.map((e) => [e.id, e]));
  const afterIds = new Set(after.map((e) => e.id));
  const removed = before
    .filter((e) => !afterIds.has(e.id))
    .map((e): EntityChange => ({ section, id: e.id, label: entityLabel(e), kind: "removed", fields: [] }));
  const addedOrChanged = after.flatMap((e): EntityChange[] => {
    const previous = beforeById.get(e.id);
    if (!previous) return [{ section, id: e.id, label: entityLabel(e), kind: "added", fields: [] }];
    const fields = fieldChanges(previous, e);
    return fields.length > 0 ? [{ section, id: e.id, label: entityLabel(e), kind: "changed", fields }] : [];
  });
  return [...removed, ...addedOrChanged];
}

/** What a visitor would see change when the showroom moves from `from` to `to`, entity by entity. */
export function diffManifests(from: DevelopmentManifest, to: DevelopmentManifest): EntityChange[] {
  return [
    ...diffSection("development", [from.development], [to.development]),
    ...diffSection("units", from.units, to.units),
    ...diffSection("scenes", from.scenes, to.scenes),
    ...diffSection("floorPlans", from.floorPlans, to.floorPlans),
    ...diffSection("gallery", from.gallery, to.gallery),
    ...diffSection("pointsOfInterest", from.pointsOfInterest, to.pointsOfInterest),
  ];
}
