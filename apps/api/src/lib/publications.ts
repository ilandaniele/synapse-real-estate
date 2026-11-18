import { and, eq, inArray, max } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { DevelopmentManifest, type Publication } from "@synapse/contracts";
import { publications, users, type Db } from "@synapse/db";
import { audit } from "./audit";
import type { SessionClaims } from "./auth";
import { conflict, HttpError, isUniqueViolation, notFound } from "./errors";
import { iso } from "./mappers";

export async function nextVersion(db: Db, developmentId: string): Promise<number> {
  const [latest] = await db.select({ version: max(publications.version) }).from(publications).where(eq(publications.developmentId, developmentId));
  return (latest?.version ?? 0) + 1;
}

/** Runs a manifest builder, turning contract violations into a 422 the admin can act on. */
export async function validManifest(build: () => DevelopmentManifest | Promise<DevelopmentManifest>): Promise<DevelopmentManifest> {
  try {
    return await build();
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(422, "MANIFEST_INVALID", "Current data does not produce a valid public manifest", error.issues);
    }
    throw error;
  }
}

/** Loads the given versions of a development's snapshots in one query, keyed by version. */
export async function loadSnapshots(
  db: Db,
  organizationId: string,
  developmentId: string,
  versions: readonly number[],
): Promise<Map<number, DevelopmentManifest>> {
  const rows = await db
    .select({ version: publications.version, snapshot: publications.snapshot })
    .from(publications)
    .where(
      and(
        eq(publications.organizationId, organizationId),
        eq(publications.developmentId, developmentId),
        inArray(publications.version, [...versions]),
      ),
    );
  const byVersion = new Map(rows.map((r) => [r.version, r.snapshot]));
  const missing = versions.find((v) => !byVersion.has(v));
  if (missing !== undefined) throw notFound(`Publication v${missing}`);
  return new Map(
    [...byVersion].map(([version, snapshot]) => {
      const parsed = DevelopmentManifest.safeParse(snapshot);
      if (!parsed.success) throw new HttpError(422, "SNAPSHOT_INCOMPATIBLE", `Publication v${version} no longer matches the manifest contract`);
      return [version, parsed.data];
    }),
  );
}

export interface StoreOptions {
  action: "development.publish" | "development.restore";
  restoredFromVersion: number | null;
}

/** Stores a validated manifest as a new version and audits it in the same transaction. */
export async function storePublication(
  app: FastifyInstance,
  actor: SessionClaims,
  developmentId: string,
  manifest: DevelopmentManifest,
  { action, restoredFromVersion }: StoreOptions,
): Promise<Publication> {
  const publishedAt = new Date(manifest.publishedAt);
  try {
    const [created] = await app.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(publications)
        .values({
          organizationId: actor.organizationId,
          developmentId,
          version: manifest.version,
          snapshot: manifest as unknown as Record<string, unknown>,
          publishedBy: actor.userId,
          publishedAt,
          restoredFromVersion,
        })
        .returning({ id: publications.id });
      await audit(tx, actor, action, "development", developmentId, {
        version: manifest.version,
        restoredFromVersion,
        units: manifest.units.length,
        scenes: manifest.scenes.length,
      });
      return inserted;
    });
    const [author] = await app.db.select({ name: users.name }).from(users).where(eq(users.id, actor.userId));
    return {
      id: created!.id,
      developmentId,
      version: manifest.version,
      publishedBy: author?.name ?? actor.userId,
      publishedAt: iso(publishedAt),
      restoredFromVersion,
    };
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("Another publish happened concurrently; retry", "PUBLISH_CONFLICT");
    throw error;
  }
}
