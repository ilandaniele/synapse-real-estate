import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assets, claimJob, createDb, importJobs, migrate, organizations, renderJobs, type DbHandle } from "../src";

describe("db (PGlite in memory)", () => {
  let handle: DbHandle;
  beforeAll(async () => {
    handle = await createDb("memory://");
    await migrate(handle.db);
    await migrate(handle.db); // idempotent
  });
  afterAll(() => handle.close());

  it("claims each pending job once, in order, with SKIP LOCKED semantics", async () => {
    const { db } = handle;
    const [org] = await db.insert(organizations).values({ name: "T", slug: "t" }).returning();
    const [asset] = await db
      .insert(assets)
      .values({ organizationId: org!.id, filename: "a.glb", declaredContentType: "model/gltf-binary", declaredSize: 10 })
      .returning();
    await db.insert(importJobs).values([
      { organizationId: org!.id, assetId: asset!.id },
      { organizationId: org!.id, assetId: asset!.id },
    ]);
    await db.insert(renderJobs).values({ organizationId: org!.id, assetId: asset!.id });

    const [a, b] = await Promise.all([claimJob(db, "IMPORT"), claimJob(db, "IMPORT")]);
    expect(a && b && a.id !== b.id).toBe(true);
    expect(a?.status).toBe("PROCESSING");
    expect(a?.attempts).toBe(1);
    expect(await claimJob(db, "IMPORT")).toBeNull();
    expect((await claimJob(db, "RENDER"))?.status).toBe("PROCESSING");
  });

  it("does not claim jobs whose run_after is in the future", async () => {
    const { db } = handle;
    const [org] = await db.insert(organizations).values({ name: "T2", slug: "t2" }).returning();
    await db.insert(importJobs).values({ organizationId: org!.id, runAfter: new Date(Date.now() + 60_000) });
    expect(await claimJob(db, "IMPORT")).toBeNull();
  });
});
