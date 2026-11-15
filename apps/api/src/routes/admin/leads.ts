import { and, count, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Uuid } from "@synapse/contracts";
import { leads, units } from "@synapse/db";
import { audit } from "../../lib/audit";
import { notFound } from "../../lib/errors";
import { IdParams } from "../../lib/params";
import { session } from "../../lib/auth";
import { leadToContract } from "../../lib/mappers";

const LeadQuery = z.object({
  developmentId: Uuid.optional(),
  unitId: Uuid.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const ExportQuery = LeadQuery.pick({ developmentId: true, unitId: true });

const EXPORT_ROW_LIMIT = 10_000;
const CSV_COLUMNS = ["id", "createdAt", "developmentId", "unitCode", "name", "email", "phone", "message", "source"] as const;

/** Quotes every cell and neutralises spreadsheet formulas (=, +, -, @, tab, CR) with a leading apostrophe. */
export function csvCell(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export default async function leadRoutes(app: FastifyInstance) {
  const filters = (organizationId: string, q: { developmentId?: string; unitId?: string }) =>
    and(
      eq(leads.organizationId, organizationId),
      q.developmentId ? eq(leads.developmentId, q.developmentId) : undefined,
      q.unitId ? eq(leads.unitId, q.unitId) : undefined,
    );

  app.get("/leads", { preHandler: app.requireAuth("lead:read") }, async (request) => {
    const { organizationId } = session(request);
    const q = LeadQuery.parse(request.query);
    const where = filters(organizationId, q);
    const [rows, totals] = await Promise.all([
      app.db
        .select({ lead: leads, unitCode: units.code })
        .from(leads)
        .leftJoin(units, eq(units.id, leads.unitId))
        .where(where)
        .orderBy(desc(leads.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      app.db.select({ total: count() }).from(leads).where(where),
    ]);
    return {
      items: rows.map((r) => leadToContract(r.lead, r.unitCode)),
      total: totals[0]?.total ?? 0,
      page: q.page,
      pageSize: q.pageSize,
    };
  });

  app.get("/leads/:id", { preHandler: app.requireAuth("lead:read") }, async (request) => {
    const { organizationId } = session(request);
    const { id } = IdParams.parse(request.params);
    const [row] = await app.db
      .select({ lead: leads, unitCode: units.code })
      .from(leads)
      .leftJoin(units, eq(units.id, leads.unitId))
      .where(and(eq(leads.id, id), eq(leads.organizationId, organizationId)));
    if (!row) throw notFound("Lead");
    return leadToContract(row.lead, row.unitCode);
  });

  app.get("/leads/export.csv", { preHandler: app.requireAuth("lead:export") }, async (request, reply) => {
    const actor = session(request);
    const q = ExportQuery.parse(request.query);
    const rows = await app.db
      .select({ lead: leads, unitCode: units.code })
      .from(leads)
      .leftJoin(units, eq(units.id, leads.unitId))
      .where(filters(actor.organizationId, q))
      .orderBy(desc(leads.createdAt))
      .limit(EXPORT_ROW_LIMIT);
    await audit(app.db, actor, "lead.export", "lead", null, { rows: rows.length });
    const lines = [CSV_COLUMNS.map(csvCell).join(",")];
    for (const { lead, unitCode } of rows) {
      const c = leadToContract(lead, unitCode);
      lines.push(CSV_COLUMNS.map((column) => csvCell(c[column] as string | null)).join(","));
    }
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="leads.csv"');
    reply.header("Cache-Control", "no-store");
    return lines.join("\r\n") + "\r\n";
  });
}
