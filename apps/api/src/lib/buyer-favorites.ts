import { desc, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { BuyerFavorites } from "@synapse/contracts";
import { buyerFavorites, units, type Db } from "@synapse/db";

const FAVORITES_LIMIT = 100;

/** The unit as the showroom sees it: its entry in the latest publication of its development, or null. */
function publishedUnitJson(unitId: AnyPgColumn): SQL<unknown> {
  return sql`(
    select entry from jsonb_array_elements((
      select p.snapshot -> 'units' from publications p
      where p.development_id = ${units.developmentId}
      order by p.version desc limit 1
    )) entry
    where entry ->> 'id' = ${unitId}::text
  )`;
}

export async function isPublishedUnit(db: Db, unitId: string): Promise<boolean> {
  const [row] = await db
    .select({ published: sql<boolean>`${publishedUnitJson(units.id)} is not null` })
    .from(units)
    .where(eq(units.id, unitId));
  return row?.published === true;
}

/** The buyer's saved units still on show, newest first. */
export async function listFavorites(db: Db, buyerId: string): Promise<BuyerFavorites> {
  const rows = await db
    .select({ unit: publishedUnitJson(buyerFavorites.unitId) })
    .from(buyerFavorites)
    .innerJoin(units, eq(units.id, buyerFavorites.unitId))
    .where(eq(buyerFavorites.buyerId, buyerId))
    .orderBy(desc(buyerFavorites.createdAt))
    .limit(FAVORITES_LIMIT);
  return BuyerFavorites.parse({ items: rows.map((r) => r.unit).filter((unit) => unit !== null) });
}

export async function favoriteUnitIds(db: Db, buyerId: string): Promise<string[]> {
  const rows = await db
    .select({ unitId: buyerFavorites.unitId })
    .from(buyerFavorites)
    .where(eq(buyerFavorites.buyerId, buyerId))
    .orderBy(desc(buyerFavorites.createdAt))
    .limit(FAVORITES_LIMIT);
  return rows.map((r) => r.unitId);
}
