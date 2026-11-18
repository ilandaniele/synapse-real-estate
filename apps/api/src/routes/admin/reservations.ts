import { and, count, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ReservationStatus, Uuid } from "@synapse/contracts";
import { reservations, units } from "@synapse/db";
import { session } from "../../lib/auth";
import { reservationToContract } from "../../lib/mappers";

const ReservationQuery = z.object({
  developmentId: Uuid.optional(),
  status: ReservationStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export default async function reservationAdminRoutes(app: FastifyInstance) {
  app.get("/reservations", { preHandler: app.requireAuth("lead:read") }, async (request) => {
    const { organizationId } = session(request);
    const q = ReservationQuery.parse(request.query);
    const where = and(
      eq(reservations.organizationId, organizationId),
      q.developmentId ? eq(reservations.developmentId, q.developmentId) : undefined,
      q.status ? eq(reservations.status, q.status) : undefined,
    );
    const [rows, totals] = await Promise.all([
      app.db
        .select({ reservation: reservations, unitCode: units.code })
        .from(reservations)
        .innerJoin(units, eq(units.id, reservations.unitId))
        .where(where)
        .orderBy(desc(reservations.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      app.db.select({ total: count() }).from(reservations).where(where),
    ]);
    return {
      items: rows.map((r) => reservationToContract(r.reservation, r.unitCode)),
      total: totals[0]?.total ?? 0,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
}
