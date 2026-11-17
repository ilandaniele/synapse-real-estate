import { and, eq } from "drizzle-orm";
import { units, type Db } from "@synapse/db";
import { badRequest } from "./errors";

/** Rejects unit ids from another development or organization; null/undefined means "no unit". */
export async function assertUnitInDevelopment(db: Db, organizationId: string, developmentId: string, unitId: string | null | undefined) {
  if (!unitId) return;
  const [unit] = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.id, unitId), eq(units.developmentId, developmentId), eq(units.organizationId, organizationId)));
  if (!unit) throw badRequest("unitId does not belong to this development");
}
