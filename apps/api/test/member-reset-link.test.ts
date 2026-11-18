import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PasswordResetLink, type Member } from "@synapse/contracts";
import { auditEvents, organizationMemberships, passwordResets, users } from "@synapse/db";
import { ADMIN, createTestContext, EMAILS, PASSWORD, type TestContext } from "./helpers";

const AUTH = "/api/v1/auth";
const NEW_PASSWORD = "handed-over-password-321";

let ctx: TestContext;
let owner: string;
let members: Member[];
beforeAll(async () => {
  ctx = await createTestContext({ config: { isProd: true, adminPublicUrl: "https://admin.example.test" } });
  owner = await ctx.login(EMAILS.owner);
  members = (await ctx.app.inject({ method: "GET", url: `${ADMIN}/members`, headers: { cookie: owner } })).json() as Member[];
});
afterAll(() => ctx.close());

const memberId = (email: string) => members.find((m) => m.email === email)!.id;
const resetLink = (id: string, cookie?: string) =>
  ctx.app.inject({ method: "POST", url: `${ADMIN}/members/${id}/password-reset-link`, headers: cookie ? { cookie } : {} });
const login = (email: string, password: string) => ctx.app.inject({ method: "POST", url: `${AUTH}/login`, payload: { email, password } });

describe("member password reset link", () => {
  it("lets an owner hand over a one-time link that resets the password", async () => {
    const res = await resetLink(memberId(EMAILS.sales), owner);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    const { resetLink: link } = PasswordResetLink.parse(res.json());
    const token = link.match(/^https:\/\/admin\.example\.test\/reset-password#token=([\w-]+)$/)?.[1];
    expect(token).toBeDefined();
    const stored = await ctx.db.select({ tokenHash: passwordResets.tokenHash }).from(passwordResets);
    expect(JSON.stringify(stored)).not.toContain(token);

    const confirm = () => ctx.app.inject({ method: "POST", url: `${AUTH}/password-reset/confirm`, payload: { token, password: NEW_PASSWORD } });
    expect((await confirm()).statusCode).toBe(204);
    expect((await confirm()).statusCode).toBe(400);
    expect((await login(EMAILS.sales, PASSWORD)).statusCode).toBe(401);
    expect((await login(EMAILS.sales, NEW_PASSWORD)).statusCode).toBe(200);

    const actions = (await ctx.db.select({ action: auditEvents.action }).from(auditEvents)).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["member.password_reset_link", "user.password_reset"]));
  });

  it("is restricted to owners (401/403)", async () => {
    const editor = await ctx.login(EMAILS.editor);
    expect((await resetLink(memberId(EMAILS.viewer))).statusCode).toBe(401);
    expect((await resetLink(memberId(EMAILS.viewer), editor)).statusCode).toBe(403);
  });

  it("hides other organizations' members (404)", async () => {
    const ownerB = await ctx.login(EMAILS.ownerB);
    expect((await resetLink(memberId(EMAILS.viewer), ownerB)).statusCode).toBe(404);
    expect((await resetLink("00000000-0000-4000-8000-000000000000", owner)).statusCode).toBe(404);
  });

  it("refuses users who also belong to another organization (409)", async () => {
    const [viewer] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, EMAILS.viewer));
    await ctx.db.insert(organizationMemberships).values({ organizationId: ctx.fx.orgB, userId: viewer!.id, role: "VIEWER" });
    const res = await resetLink(memberId(EMAILS.viewer), owner);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("MEMBER_IN_OTHER_ORGANIZATIONS");
  });
});
