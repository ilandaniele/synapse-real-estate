import type { FastifyInstance } from "fastify";
import { AnalyticsQuery, type VisitAnalytics } from "@synapse/contracts";
import { visitTotals, type VisitTotalRow } from "@synapse/db";
import { session } from "../../lib/auth";
import { notFound } from "../../lib/errors";
import { IdParams } from "../../lib/params";

const TOP_LIMIT = 20;

function toAnalytics(days: number, rows: VisitTotalRow[]): VisitAnalytics {
  const top = <T>(kind: VisitTotalRow["kind"], map: (row: VisitTotalRow & { targetId: string }) => T) =>
    rows
      .filter((row): row is VisitTotalRow & { targetId: string } => row.kind === kind && row.targetId !== null)
      .slice(0, TOP_LIMIT)
      .map(map);
  return {
    days,
    units: top("UNIT", (row) => ({ id: row.targetId, code: row.unitCode!, name: row.unitName!, views: row.views })),
    scenes: top("SCENE", (row) => ({ id: row.targetId, name: row.sceneName!, unitCode: row.sceneUnitCode, views: row.views })),
  };
}

export default async function analyticsRoutes(app: FastifyInstance) {
  app.get("/developments/:id/analytics", { preHandler: app.requireAuth("development:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    const { days } = AnalyticsQuery.parse(request.query);
    const rows = await visitTotals(app.db, organizationId, id, days);
    if (rows.length === 0) throw notFound("Development");
    return toAnalytics(days, rows);
  });
}
