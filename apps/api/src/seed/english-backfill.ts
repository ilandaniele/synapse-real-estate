import { and, desc, eq, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DevelopmentManifest } from "@synapse/contracts";
import {
  createDb,
  developments,
  floorPlans,
  galleryItems,
  organizationMemberships,
  pointsOfInterest,
  publications,
  sceneHotspots,
  scenes,
  units,
  type Db,
} from "@synapse/db";
import { loadConfig, type Config } from "../config";
import { buildManifest } from "../lib/manifest";
import { nextVersion, storePublication } from "../lib/publications";
import { inEnglish } from "./english";

type TranslatableTable = PgTable & { id: PgColumn; translations: PgColumn } & Record<string, PgColumn>;

/** The Spanish fields the demo seed translates, per table. */
const TRANSLATABLE: [string, TranslatableTable, string[]][] = [
  ["developments", developments as unknown as TranslatableTable, ["tagline", "description"]],
  ["units", units as unknown as TranslatableTable, ["orientation", "description"]],
  ["scenes", scenes as unknown as TranslatableTable, ["name"]],
  ["hotspots", sceneHotspots as unknown as TranslatableTable, ["label", "description"]],
  ["floor plans", floorPlans as unknown as TranslatableTable, ["name"]],
  ["gallery", galleryItems as unknown as TranslatableTable, ["title"]],
  ["points of interest", pointsOfInterest as unknown as TranslatableTable, ["name", "distanceText"]],
];

class DryRun extends Error {}

/** Fills empty `translations` with the demo English text; rows an admin already translated are left alone. */
async function fillTranslations(db: Db): Promise<number> {
  let filled = 0;
  for (const [label, table, fields] of TRANSLATABLE) {
    const columns = Object.fromEntries(fields.map((field) => [field, table[field]!]));
    const rows = (await db
      .select({ id: table.id, ...columns })
      .from(table)
      .where(sql`${table.translations} = '{}'::jsonb`)) as ({ id: string } & Record<string, string | null>)[];
    const updates = rows.flatMap((row) => {
      const translations = inEnglish(Object.fromEntries(fields.map((field) => [field, row[field]])));
      return translations.en ? [{ id: row.id, translations }] : [];
    });
    for (const { id, translations } of updates) await db.update(table).set({ translations }).where(eq(table.id, id));
    console.log(`  ${label}: ${updates.length} of ${rows.length} untranslated rows filled`);
    filled += updates.length;
  }
  return filled;
}

/**
 * A manifest's content without its version stamp and the given keys. Object keys are sorted (jsonb does not keep
 * their order), and null or empty values are dropped, as older snapshots lack fields added since.
 */
function contentWithout(manifest: DevelopmentManifest, keys: string[]): string {
  const { version: _version, publishedAt: _publishedAt, ...content } = manifest;
  return JSON.stringify(content, (key, value) => {
    if (keys.includes(key) || value === null) return undefined;
    if (typeof value !== "object" || Array.isArray(value)) return value;
    const entries = Object.entries(value);
    return entries.length > 0 ? Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))) : undefined;
  });
}

/** Publishes a development again when, compared with its latest version, only translations changed. */
async function republish(db: Db, config: Config, development: typeof developments.$inferSelect): Promise<void> {
  const [latest] = await db
    .select({ snapshot: publications.snapshot, userId: organizationMemberships.userId, role: organizationMemberships.role })
    .from(publications)
    .innerJoin(
      organizationMemberships,
      and(eq(organizationMemberships.userId, publications.publishedBy), eq(organizationMemberships.organizationId, publications.organizationId)),
    )
    .where(eq(publications.developmentId, development.id))
    .orderBy(desc(publications.version))
    .limit(1);
  if (!latest) return console.log(`  ${development.slug}: never published, skipped`);

  const published = latest.snapshot as unknown as DevelopmentManifest;
  const draft = await buildManifest(db, config, development, await nextVersion(db, development.id), new Date());
  if (contentWithout(draft, ["translations", "updatedAt"]) !== contentWithout(published, ["translations", "updatedAt"])) {
    return console.log(`  ${development.slug}: has unpublished edits besides translations, skipped (publish it from the admin)`);
  }
  if (contentWithout(draft, ["updatedAt"]) === contentWithout(published, ["updatedAt"])) {
    return console.log(`  ${development.slug}: nothing new to publish`);
  }
  const actor = { userId: latest.userId, organizationId: development.organizationId, role: latest.role };
  await storePublication(db, actor, development.id, draft, { action: "development.publish", restoredFromVersion: null });
  console.log(`  ${development.slug}: published v${draft.version}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = loadConfig();
  const handle = await createDb(config.databaseUrl);
  try {
    await handle.db.transaction(async (tx) => {
      console.log("Filling English translations:");
      const filled = await fillTranslations(tx as unknown as Db);
      console.log("Publishing:");
      if (filled > 0) for (const development of await tx.select().from(developments)) await republish(tx as unknown as Db, config, development);
      if (dryRun) throw new DryRun();
    });
    console.log("Done.");
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
    console.log("Dry run: rolled back, nothing was written.");
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
