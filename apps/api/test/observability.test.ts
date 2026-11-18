import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importJobs } from "@synapse/db";
import { createTestContext, type TestContext } from "./helpers";

const TOKEN = "metrics-token-for-tests-0123456789";

describe("readiness", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => ctx.close());

  it("answers 200 when the database responds", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready" });
  });

  it("hides /metrics when no token is configured", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/metrics", headers: { authorization: `Bearer ${TOKEN}` } });
    expect(res.statusCode).toBe(404);
  });
});

describe("/metrics", () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext({ config: { metricsToken: TOKEN } });
    await ctx.db.insert(importJobs).values({ organizationId: ctx.fx.orgA, status: "FAILED" });
  });
  afterAll(() => ctx.close());

  const scrape = (authorization?: string) =>
    ctx.app.inject({ method: "GET", url: "/metrics", headers: authorization ? { authorization } : {} });

  it("rejects a missing or wrong token", async () => {
    expect((await scrape()).statusCode).toBe(401);
    expect((await scrape("Bearer wrong-token")).statusCode).toBe(401);
  });

  it("reports request durations by route pattern, not by raw URL", async () => {
    await ctx.app.inject({ method: "GET", url: "/api/v1/public/developments/does-not-exist/manifest" });
    const res = await scrape(`Bearer ${TOKEN}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/v1/public/developments/:slug/manifest",status_code="404"} 1',
    );
    expect(res.body).not.toContain("does-not-exist");
  });

  it("reports queued jobs by kind and status", async () => {
    const res = await scrape(`Bearer ${TOKEN}`);
    expect(res.body).toContain('synapse_jobs{kind="IMPORT",status="FAILED"} 1');
    expect(res.body).toContain('synapse_jobs{kind="RENDER",status="PENDING"} 0');
  });

  it("includes process metrics", async () => {
    expect((await scrape(`Bearer ${TOKEN}`)).body).toContain("process_cpu_seconds_total");
  });
});
