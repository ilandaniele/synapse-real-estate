import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export interface DbHandle {
  db: Db;
  driver: "postgres" | "pglite";
  close(): Promise<void>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, "../../..");
export const MIGRATIONS_FOLDER = path.resolve(here, "../migrations");

const migrators = new WeakMap<object, () => Promise<void>>();

/**
 * DATABASE_URL set (postgres://...)  -> real Postgres via `postgres` driver.
 * DATABASE_URL=memory://             -> in-memory PGlite (tests).
 * DATABASE_URL empty                 -> PGlite persisted at <repo>/.data/pglite.
 */
export async function createDb(databaseUrl: string | undefined = process.env.DATABASE_URL): Promise<DbHandle> {
  const url = databaseUrl?.trim();
  if (url && !url.startsWith("memory://")) {
    const client = postgres(url, { max: 10, onnotice: () => {} });
    const db = drizzlePostgres(client, { schema });
    migrators.set(db, () => migratePostgres(db, { migrationsFolder: MIGRATIONS_FOLDER }));
    return { db: db as unknown as Db, driver: "postgres", close: () => client.end() };
  }
  let client: PGlite;
  if (url?.startsWith("memory://")) {
    client = new PGlite();
  } else {
    const dir = path.join(REPO_ROOT, ".data", "pglite");
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  migrators.set(db, () => migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER }));
  return { db: db as unknown as Db, driver: "pglite", close: () => client.close() };
}

/** Applies the drizzle-kit SQL migrations in packages/db/migrations (idempotent). */
export async function migrate(db: Db): Promise<void> {
  const run = migrators.get(db);
  if (!run) throw new Error("migrate(db): db was not created by createDb()");
  await run();
}
