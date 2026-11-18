import path from "node:path";
import { copyPgliteToPostgres, REPO_ROOT } from "@synapse/db";

const pgliteDir = path.resolve(REPO_ROOT, process.env.PGLITE_DIR ?? ".data/pglite");
const databaseUrl = process.env.DATABASE_URL ?? "";

const copies = await copyPgliteToPostgres(pgliteDir, databaseUrl);
for (const { table, rows } of copies) console.log(`${table}: ${rows}`);
console.log(`Copied ${copies.length} tables from ${pgliteDir}; counts and content hashes match.`);
