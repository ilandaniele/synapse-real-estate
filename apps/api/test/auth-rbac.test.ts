import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ApiError } from "@synapse/contracts";
import { auditEvents, unitAvailabilityHistory } from "@synapse/db";
import { ADMIN, createTestContext, EMAILS, PASSWORD, unitBody, type TestContext } from "./helpers";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

describe("auth", () => {
  it("logs in, sets an httpOnly SameSite=Lax cookie and returns the SessionUser", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: EMAILS.owner, password: PASSWORD } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: EMAILS.owner, role: "OWNER", organizationName: "Org A", organizationId: ctx.fx.orgA });
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toContain("synapse_session=");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toContain(PASSWORD);
  });

  it("rejects wrong password and unknown email identically, with the ApiError shape", async () => {
    const wrong = await ctx.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: EMAILS.owner, password: "wrong-password-1" } });
    const unknown = await ctx.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "nobody@a.test", password: "wrong-password-1" } });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(ApiError.safeParse(wrong.json()).success).toBe(true);
    expect(wrong.headers["set-cookie"]).toBeUndefined();
  });

  it("returns /auth/me for a session and 401 without one", async () => {
    const cookie = await ctx.login(EMAILS.sales);
    const me = await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: EMAILS.sales, role: "SALES" });
    const anon = await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(anon.statusCode).toBe(401);
    const forged = await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie: "synapse_session=not.a.jwt" } });
    expect(forged.statusCode).toBe(401);
  });

  it("logout clears the cookie", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/api/v1/auth/logout" });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["set-cookie"])).toMatch(/synapse_session=;/);
  });

  it("validates the login body", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "nope" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("applies the strict login rate limit", async () => {
    const limited = await createTestContext({ rateLimit: { login: 3 } });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await limited.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: EMAILS.owner, password: "wrong-password-1" } });
        codes.push(res.statusCode);
      }
      expect(codes).toEqual([401, 401, 401, 429, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe("security headers and errors", () => {
  it("sets hardening headers and returns ApiError for unknown routes", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/nope" });
    expect(res.statusCode).toBe(404);
    expect(ApiError.safeParse(res.json()).success).toBe(true);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(String(res.headers["content-security-policy"])).toContain("default-src 'none'");
  });

  it("rejects bodies over 1 MB", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "a@b.co", password: "x".repeat(1_100_000) },
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("serves health and the OpenAPI document", async () => {
    expect((await ctx.app.inject({ method: "GET", url: "/health" })).json()).toEqual({ status: "ok" });
    const spec = await ctx.app.inject({ method: "GET", url: "/docs/json" });
    expect(spec.statusCode).toBe(200);
    const doc = spec.json();
    expect(Object.keys(doc.paths)).toContain("/api/v1/public/leads");
    expect(doc.paths["/api/v1/public/leads"].post.requestBody.content["application/json"].schema.properties.consent).toBeDefined();
  });
});

describe("RBAC", () => {
  it("viewer cannot create a unit (403) but can read", async () => {
    const cookie = await ctx.login(EMAILS.viewer);
    const create = await ctx.app.inject({ method: "POST", url: `${ADMIN}/developments/${ctx.fx.devA}/units`, headers: { cookie }, payload: unitBody() });
    expect(create.statusCode).toBe(403);
    expect(create.json().error.code).toBe("FORBIDDEN");
    const list = await ctx.app.inject({ method: "GET", url: `${ADMIN}/developments/${ctx.fx.devA}/units`, headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const leads = await ctx.app.inject({ method: "GET", url: `${ADMIN}/leads`, headers: { cookie } });
    expect(leads.statusCode).toBe(403);
  });

  it("unauthenticated admin requests get 401", async () => {
    const res = await ctx.app.inject({ method: "GET", url: `${ADMIN}/developments` });
    expect(res.statusCode).toBe(401);
  });

  it("editor creates a unit; mesh names and unit type are stored", async () => {
    const cookie = await ctx.login(EMAILS.editor);
    const res = await ctx.app.inject({ method: "POST", url: `${ADMIN}/developments/${ctx.fx.devA}/units`, headers: { cookie }, payload: unitBody() });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ code: "V9", slug: "villa-9", unitType: "Villa 4D", meshNames: ["Villa_09"], price: "700000.00", status: "AVAILABLE" });
    const dup = await ctx.app.inject({ method: "POST", url: `${ADMIN}/developments/${ctx.fx.devA}/units`, headers: { cookie }, payload: unitBody() });
    expect(dup.statusCode).toBe(409);
  });

  it("sales can patch availability and a history row is written", async () => {
    const cookie = await ctx.login(EMAILS.sales);
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `${ADMIN}/units/${ctx.fx.unitA1}/availability`,
      headers: { cookie },
      payload: { status: "RESERVED", reason: "Cliente con senal" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("RESERVED");
    const history = await ctx.db.select().from(unitAvailabilityHistory).where(eq(unitAvailabilityHistory.unitId, ctx.fx.unitA1));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: "AVAILABLE", toStatus: "RESERVED", reason: "Cliente con senal", organizationId: ctx.fx.orgA });
    expect(history[0]!.changedBy).toBeTruthy();
    const audit = await ctx.db.select().from(auditEvents).where(eq(auditEvents.entityId, ctx.fx.unitA1));
    expect(audit.map((a) => a.action)).toContain("unit.availability");
  });

  it("rejects invalid transitions with 409 and does not write history", async () => {
    const cookie = await ctx.login(EMAILS.sales);
    const res = await ctx.app.inject({ method: "PATCH", url: `${ADMIN}/units/${ctx.fx.unitA2}/availability`, headers: { cookie }, payload: { status: "SOLD" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("INVALID_TRANSITION");
    const history = await ctx.db.select().from(unitAvailabilityHistory).where(eq(unitAvailabilityHistory.unitId, ctx.fx.unitA2));
    expect(history).toHaveLength(0);
  });

  it("sales cannot edit units or publish", async () => {
    const cookie = await ctx.login(EMAILS.sales);
    const patch = await ctx.app.inject({ method: "PATCH", url: `${ADMIN}/units/${ctx.fx.unitA1}`, headers: { cookie }, payload: { name: "Hack" } });
    expect(patch.statusCode).toBe(403);
    const publish = await ctx.app.inject({ method: "POST", url: `${ADMIN}/developments/${ctx.fx.devA}/publish`, headers: { cookie } });
    expect(publish.statusCode).toBe(403);
  });

  it("only sales/owner can export leads", async () => {
    const editor = await ctx.login(EMAILS.editor);
    expect((await ctx.app.inject({ method: "GET", url: `${ADMIN}/leads/export.csv`, headers: { cookie: editor } })).statusCode).toBe(403);
    const sales = await ctx.login(EMAILS.sales);
    expect((await ctx.app.inject({ method: "GET", url: `${ADMIN}/leads/export.csv`, headers: { cookie: sales } })).statusCode).toBe(200);
  });

  it("validates unit input (400) before touching the database", async () => {
    const cookie = await ctx.login(EMAILS.editor);
    const res = await ctx.app.inject({ method: "POST", url: `${ADMIN}/developments/${ctx.fx.devA}/units`, headers: { cookie }, payload: unitBody({ price: "12.345", code: "BAD" }) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.details[0].path).toBe("price");
    const badId = await ctx.app.inject({ method: "GET", url: `${ADMIN}/units/not-a-uuid`, headers: { cookie } });
    expect(badId.statusCode).toBe(400);
  });
});
