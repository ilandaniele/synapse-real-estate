import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { auditEvents, leads } from "@synapse/db";
import { csvCell } from "../src/routes/admin/leads";
import { ADMIN, createTestContext, EMAILS, type TestContext } from "./helpers";

const LEADS = "/api/v1/public/leads";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

const body = (overrides: Record<string, unknown> = {}) => ({
  developmentSlug: "dev-a",
  name: "Carla Prueba",
  email: "Carla@Example.com",
  phone: "+34 600 111 222",
  message: "Quiero visitar la villa",
  consent: true,
  ...overrides,
});
const post = (payload: unknown, c: TestContext = ctx) => c.app.inject({ method: "POST", url: LEADS, payload: payload as object });

describe("public lead submission", () => {
  it("stores a valid lead in the owning organization with a hashed IP and consent timestamp", async () => {
    const res = await post(body({ unitId: ctx.fx.unitA1 }));
    expect(res.statusCode).toBe(201);
    const { id } = res.json() as { id: string };
    const [row] = await ctx.db.select().from(leads).where(eq(leads.id, id));
    expect(row).toMatchObject({ organizationId: ctx.fx.orgA, developmentId: ctx.fx.devA, unitId: ctx.fx.unitA1, email: "carla@example.com", source: "showroom" });
    expect(row!.consentAt).toBeInstanceOf(Date);
    expect(row!.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.ipHash).not.toContain("127.0.0.1");
  });

  it("rejects missing or false consent with 400", async () => {
    const missing = await post(body({ consent: undefined }));
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe("VALIDATION_ERROR");
    const falsy = await post(body({ consent: false }));
    expect(falsy.statusCode).toBe(400);
  });

  it("rejects invalid email, short name and bad phone", async () => {
    expect((await post(body({ email: "nope" }))).statusCode).toBe(400);
    expect((await post(body({ name: "A" }))).statusCode).toBe(400);
    expect((await post(body({ phone: "abc" }))).statusCode).toBe(400);
  });

  it("returns 404 for an unknown development and 400 for an unlisted unit", async () => {
    expect((await post(body({ developmentSlug: "nope" }))).statusCode).toBe(404);
    expect((await post(body({ unitId: ctx.fx.unitA2 }))).statusCode).toBe(400);
    expect((await post(body({ unitId: ctx.fx.unitB1 }))).statusCode).toBe(400);
  });

  it("honeypot: answers 202 and stores nothing", async () => {
    const before = (await ctx.db.select().from(leads)).length;
    const res = await post(body({ website: "http://spam.example", consent: undefined, email: "invalid" }));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ accepted: true });
    expect((await ctx.db.select().from(leads)).length).toBe(before);
  });

  it("rate limits to 5 per minute per IP (429 on the 6th)", async () => {
    const limited = await createTestContext({ rateLimit: { leads: 5 } });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 7; i++) codes.push((await post(body({ email: `p${i}@example.com` }), limited)).statusCode);
      expect(codes).toEqual([201, 201, 201, 201, 201, 429, 429]);
      const limitedRes = await post(body(), limited);
      expect(limitedRes.json().error.code).toBe("RATE_LIMITED");
    } finally {
      await limited.close();
    }
  });
});

describe("lead admin and CSV export", () => {
  it("csvCell quotes and neutralises formula prefixes", () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell("+34 600")).toBe(`"'+34 600"`);
    expect(csvCell("-2")).toBe(`"'-2"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell("\tx")).toBe(`"'\tx"`);
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell(null)).toBe('""');
  });

  it("exports injected values as inert text and writes an audit event", async () => {
    const ok = await post(body({ name: "=HYPERLINK(\"http://evil\",\"x\")", email: "inj@example.com", message: "@cmd|' /C calc'!A0" }));
    expect(ok.statusCode).toBe(201);
    const cookie = await ctx.login(EMAILS.sales);
    const res = await ctx.app.inject({ method: "GET", url: `${ADMIN}/leads/export.csv`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("leads.csv");
    expect(res.body).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(res.body).toContain(`"'@cmd|' /C calc'!A0"`);
    for (const line of res.body.split("\r\n")) {
      for (const cell of line.split('","')) expect(cell.replace(/^"/, "")).not.toMatch(/^[=+\-@\t\r]/);
    }
    const events = await ctx.db.select().from(auditEvents).where(eq(auditEvents.action, "lead.export"));
    expect(events).toHaveLength(1);
  });

  it("lists leads paginated with unit code", async () => {
    const cookie = await ctx.login(EMAILS.owner);
    const res = await ctx.app.inject({ method: "GET", url: `${ADMIN}/leads?pageSize=2&page=1`, headers: { cookie } });
    const page = res.json() as { items: { unitCode: string | null }[]; total: number; pageSize: number };
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
    expect(page.pageSize).toBe(2);
    const bad = await ctx.app.inject({ method: "GET", url: `${ADMIN}/leads?pageSize=1000`, headers: { cookie } });
    expect(bad.statusCode).toBe(400);
  });
});
