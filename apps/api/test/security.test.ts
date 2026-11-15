import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { organizationMemberships, users } from "@synapse/db";
import { ADMIN, createTestContext, EMAILS, unitBody, type TestContext } from "./helpers";

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

async function membershipOf(email: string) {
  const [user] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  return and(eq(organizationMemberships.userId, user!.id), eq(organizationMemberships.organizationId, ctx.fx.orgA));
}

describe("session follows the current membership", () => {
  it("applies a role downgrade to an existing session at once", async () => {
    const cookie = await ctx.login(EMAILS.editor);
    await ctx.db.update(organizationMemberships).set({ role: "VIEWER" }).where(await membershipOf(EMAILS.editor));
    const res = await ctx.app.inject({
      method: "POST",
      url: `${ADMIN}/developments/${ctx.fx.devA}/units`,
      headers: { cookie },
      payload: unitBody({ code: "V77" }),
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects the session of a user removed from the organization", async () => {
    const cookie = await ctx.login(EMAILS.sales);
    await ctx.db.delete(organizationMemberships).where(await membershipOf(EMAILS.sales));
    const res = await ctx.app.inject({ method: "GET", url: `${ADMIN}/leads`, headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });
});

describe("cross-site request defence", () => {
  it("rejects writes from an origin outside the allow-list", async () => {
    const cookie = await ctx.login(EMAILS.owner);
    const res = await ctx.app.inject({
      method: "PATCH",
      url: `${ADMIN}/units/${ctx.fx.unitA1}`,
      headers: { cookie, origin: "https://evil.example" },
      payload: { name: "Hijacked" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("accepts writes from an allowed origin and reads from any origin", async () => {
    const cookie = await ctx.login(EMAILS.owner);
    const write = await ctx.app.inject({
      method: "PATCH",
      url: `${ADMIN}/units/${ctx.fx.unitA1}`,
      headers: { cookie, origin: "http://localhost:3001" },
      payload: { name: "Villa renamed" },
    });
    expect(write.statusCode).toBe(200);
    const read = await ctx.app.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(read.statusCode).toBe(200);
  });
});

describe("production hardening", () => {
  it("does not serve the API docs in production", async () => {
    const prod = await createTestContext({ config: { isProd: true } });
    try {
      expect((await prod.app.inject({ method: "GET", url: "/docs" })).statusCode).toBe(404);
    } finally {
      await prod.close();
    }
    expect((await ctx.app.inject({ method: "GET", url: "/docs" })).statusCode).not.toBe(404);
  });
});
