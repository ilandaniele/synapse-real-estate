import { and, desc, eq, gte, sql, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "./client";
import { developments, scenes, units, visitStats, visitKindEnum } from "./schema";

export type VisitKind = (typeof visitKindEnum.enumValues)[number];

export interface VisitEvent {
  developmentSlug: string;
  kind: VisitKind;
  targetId: string;
}

/**
 * Adds one view to today's counter in a single statement. The target must be a listed unit or a scene of the
 * development; anything else inserts nothing, so the caller cannot tell valid ids from invalid ones.
 */
export async function recordVisit(db: Db, { developmentSlug, kind, targetId }: VisitEvent): Promise<void> {
  const targetExists =
    kind === "UNIT"
      ? sql`exists (select 1 from ${units} where ${units.id} = ${targetId} and ${units.developmentId} = ${developments.id} and ${units.status} <> 'UNLISTED')`
      : sql`exists (select 1 from ${scenes} where ${scenes.id} = ${targetId} and ${scenes.developmentId} = ${developments.id})`;
  await db.execute(sql`
    insert into ${visitStats} (organization_id, development_id, day, kind, target_id, views)
    select ${developments.organizationId}, ${developments.id}, current_date, ${kind}::visit_kind, ${targetId}::uuid, 1
    from ${developments}
    where ${developments.slug} = ${developmentSlug} and ${targetExists}
    on conflict (development_id, day, kind, target_id) do update set views = ${visitStats.views} + 1`);
}

export interface VisitTotalRow {
  kind: VisitKind | null;
  targetId: string | null;
  views: number;
  unitCode: string | null;
  unitName: string | null;
  sceneName: string | null;
  sceneUnitCode: string | null;
}

/**
 * Views per unit and scene over the last `days` days (UTC dates), most viewed first. Returns no rows when the
 * development is not in the organization, and one row with a null `kind` when it is but has no visits.
 */
export async function visitTotals(db: Db, organizationId: string, developmentId: string, days: number): Promise<VisitTotalRow[]> {
  const sceneUnit = alias(units, "scene_unit");
  const views = sum(visitStats.views).mapWith(Number);
  return db
    .select({
      kind: visitStats.kind,
      targetId: visitStats.targetId,
      views,
      unitCode: units.code,
      unitName: units.name,
      sceneName: scenes.name,
      sceneUnitCode: sceneUnit.code,
    })
    .from(developments)
    .leftJoin(
      visitStats,
      and(eq(visitStats.developmentId, developments.id), gte(visitStats.day, sql`current_date - ${days - 1}::int`)),
    )
    .leftJoin(units, and(eq(visitStats.kind, "UNIT"), eq(units.id, visitStats.targetId)))
    .leftJoin(scenes, and(eq(visitStats.kind, "SCENE"), eq(scenes.id, visitStats.targetId)))
    .leftJoin(sceneUnit, eq(sceneUnit.id, scenes.unitId))
    .where(and(eq(developments.id, developmentId), eq(developments.organizationId, organizationId)))
    .groupBy(visitStats.kind, visitStats.targetId, units.code, units.name, scenes.name, sceneUnit.code)
    .orderBy(desc(views), units.code, scenes.name)
    .then((rows) => rows.filter((row) => row.kind === null || isKnownTarget(row)));
}

const isKnownTarget = (row: VisitTotalRow) => (row.kind === "UNIT" ? row.unitCode !== null : row.sceneName !== null);
