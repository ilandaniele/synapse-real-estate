import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

/** Liveness (process up) and readiness (database answers) probes. */
export default async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok" as const }));

  app.get("/health/ready", async (request, reply) => {
    try {
      await app.db.execute(sql`select 1`);
      return { status: "ready" as const };
    } catch (error) {
      request.log.error({ err: error }, "readiness check failed");
      return reply.code(503).send({ status: "unavailable" });
    }
  });
}
