import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { copyTables, MIGRATIONS_FOLDER, organizationMemberships, organizations, pgliteQuery, schema, users } from "../src";

const opened: PGlite[] = [];

async function migratedDatabase() {
  const client = new PGlite();
  opened.push(client);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { client, db };
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((client) => client.close()));
});

describe("copyTables", () => {
  it("copies every row with identical content and keeps foreign keys valid", async () => {
    const source = await migratedDatabase();
    const [org] = await source.db.insert(organizations).values({ name: "Org", slug: "org" }).returning();
    const [user] = await source.db
      .insert(users)
      .values({ email: "a@example.test", name: "Ana \"Q\"", passwordHash: "x", sessionsValidAfter: new Date("2026-11-18T10:00:00.123Z") })
      .returning();
    await source.db.insert(organizationMemberships).values({ organizationId: org!.id, userId: user!.id, role: "OWNER" });

    const target = await migratedDatabase();
    const copies = await target.client.transaction((tx) => copyTables(pgliteQuery(source.client), pgliteQuery(tx)));

    expect(copies).toEqual(
      expect.arrayContaining([
        { table: "organizations", rows: 1 },
        { table: "users", rows: 1 },
        { table: "organization_memberships", rows: 1 },
      ]),
    );
    const [copied] = await target.db.select().from(users);
    expect(copied).toEqual(user);
    const orphans = await target.client.query(
      "select count(*)::int as n from organization_memberships m left join users u on u.id = m.user_id where u.id is null",
    );
    expect(orphans.rows).toEqual([{ n: 0 }]);
  });

  it("refuses a target that already has data", async () => {
    const source = await migratedDatabase();
    const target = await migratedDatabase();
    await target.db.insert(organizations).values({ name: "Existing", slug: "existing" });
    await expect(target.client.transaction((tx) => copyTables(pgliteQuery(source.client), pgliteQuery(tx)))).rejects.toThrow(
      "Target table organizations is not empty",
    );
  });

  it("refuses a target without the source's tables", async () => {
    const source = await migratedDatabase();
    const empty = new PGlite();
    opened.push(empty);
    await expect(empty.transaction((tx) => copyTables(pgliteQuery(source.client), pgliteQuery(tx)))).rejects.toThrow(
      "Target is missing tables",
    );
  });
});
