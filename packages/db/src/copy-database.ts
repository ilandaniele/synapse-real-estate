import { existsSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { createDb, migrate } from "./client";

export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface TableCopy {
  table: string;
  rows: number;
}

const TABLES_SQL = `select table_name as name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function tableNames(query: Query): Promise<string[]> {
  return (await query(TABLES_SQL)).map((row) => String(row.name));
}

async function fingerprint(query: Query, table: string): Promise<{ rows: number; hash: string }> {
  const [row] = await query(
    `select count(*)::int as rows, md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as hash from ${quoted(table)} t`,
  );
  return { rows: Number(row!.rows), hash: String(row!.hash) };
}

/**
 * Copies every public table from `source` into an already migrated, empty `target`, then checks that each
 * table has the same row count and content hash on both sides. Run `target` inside a transaction: it turns
 * off foreign-key triggers for that transaction only, so tables can be copied in any order.
 */
export async function copyTables(source: Query, target: Query): Promise<TableCopy[]> {
  const tables = await tableNames(source);
  const targetTables = await tableNames(target);
  const missing = tables.filter((table) => !targetTables.includes(table));
  if (missing.length > 0) throw new Error(`Target is missing tables: ${missing.join(", ")}`);
  for (const table of targetTables) {
    if ((await fingerprint(target, table)).rows > 0) throw new Error(`Target table ${table} is not empty`);
  }

  await source("set timezone = 'UTC'");
  await target("set local timezone = 'UTC'");
  await target("set local session_replication_role = replica");
  const copies: TableCopy[] = [];
  for (const table of tables) {
    const [row] = await source(`select coalesce(jsonb_agg(t), '[]')::text as rows from ${quoted(table)} t`);
    await target(`insert into ${quoted(table)} select * from jsonb_populate_recordset(null::${quoted(table)}, $1::text::jsonb)`, [row!.rows]);
    const [from, to] = [await fingerprint(source, table), await fingerprint(target, table)];
    if (from.rows !== to.rows || from.hash !== to.hash) throw new Error(`Table ${table} differs after the copy`);
    copies.push({ table, rows: to.rows });
  }
  return copies;
}

export const pgliteQuery =
  (client: Pick<PGlite, "query">): Query =>
  async (text, params) =>
    (await client.query<Record<string, unknown>>(text, params)).rows;

/** Migrates the Postgres database at `databaseUrl` and copies the PGlite data directory into it, in one transaction. */
export async function copyPgliteToPostgres(pgliteDir: string, databaseUrl: string): Promise<TableCopy[]> {
  if (!existsSync(pgliteDir)) throw new Error(`PGlite directory not found: ${pgliteDir}`);
  const handle = await createDb(databaseUrl);
  try {
    if (handle.driver !== "postgres") throw new Error("DATABASE_URL must point at Postgres");
    await migrate(handle.db);
  } finally {
    await handle.close();
  }

  const source = new PGlite(pgliteDir);
  const target = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await source.waitReady;
    return await target.begin((tx) =>
      copyTables(pgliteQuery(source), async (text, params = []) => tx.unsafe(text, params as postgres.ParameterOrJSON<never>[])),
    );
  } finally {
    await source.close();
    await target.end();
  }
}
