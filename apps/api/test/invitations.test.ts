import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Invitation, InvitationCreated, InvitationPreview, SessionUser } from "@synapse/contracts";
import { auditEvents, invitations, passwordResets } from "@synapse/db";
import type { MailMessage } from "../src/lib/mailer";
import { ADMIN, createTestContext, EMAILS, PASSWORD, type TestContext } from "./helpers";

const AUTH = "/api/v1/auth";
const NEW_PASSWORD = "brand-new-password-789";

const outbox: MailMessage[] = [];
let ctx: TestContext;
let owner: string;
beforeAll(async () => {
  ctx = await createTestContext({
    mailer: { send: async (message) => void outbox.push(message) },
    config: { adminPublicUrl: "https://admin.example.test" },
  });
  owner = await ctx.login(EMAILS.owner);
});
afterAll(() => ctx.close());
beforeEach(() => {
  outbox.length = 0;
});

const send = (method: "POST" | "DELETE" | "GET", url: string, cookie?: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload ? { payload } : {}) });

const login = (email: string, password: string) => send("POST", `${AUTH}/login`, undefined, { email, password });

function tokenFromLastMail(page: string): string {
  const mail = outbox.at(-1);
  if (!mail) throw new Error("no email sent");
  const match = mail.text.match(new RegExp(`https://admin\\.example\\.test/${page}#token=([\\w-]+)`));
  if (!match) throw new Error(`no ${page} link in: ${mail.text}`);
  return match[1]!;
}

async function invite(email: string, role = "EDITOR") {
  const res = await send("POST", `${ADMIN}/invitations`, owner, { email, role });
  expect(res.statusCode, res.body).toBe(201);
  expect(res.json().inviteLink).toBeNull();
  return { invitation: Invitation.parse(res.json()), token: tokenFromLastMail("accept-invite") };
}

describe("invitations", () => {
  it("emails a link whose token is never returned or stored in clear", async () => {
    const { invitation, token } = await invite("Invitada@A.test", "SALES");
    expect(invitation).toMatchObject({ email: "invitada@a.test", role: "SALES" });
    expect(outbox[0]).toMatchObject({ to: "invitada@a.test", subject: "Invitación a Org A" });
    const [row] = await ctx.db.select().from(invitations).where(eq(invitations.id, invitation.id));
    expect(row!.tokenHash).not.toContain(token);
    expect(JSON.stringify(invitation)).not.toContain(token);

    const list = (await send("GET", `${ADMIN}/invitations`, owner)).json() as Invitation[];
    expect(list.map((i) => i.email)).toContain("invitada@a.test");
    expect(JSON.stringify(list)).not.toMatch(/token/i);
  });

  it("is restricted to member managers (401/403) and scoped to the organization", async () => {
    expect((await send("GET", `${ADMIN}/invitations`)).statusCode).toBe(401);
    const editor = await ctx.login(EMAILS.editor);
    expect((await send("GET", `${ADMIN}/invitations`, editor)).statusCode).toBe(403);
    expect((await send("POST", `${ADMIN}/invitations`, editor, { email: "x@a.test", role: "OWNER" })).statusCode).toBe(403);

    const { invitation } = await invite("scoped@a.test");
    const ownerB = await ctx.login(EMAILS.ownerB);
    const listB = (await send("GET", `${ADMIN}/invitations`, ownerB)).json() as Invitation[];
    expect(listB.map((i) => i.id)).not.toContain(invitation.id);
    expect((await send("DELETE", `${ADMIN}/invitations/${invitation.id}`, ownerB)).statusCode).toBe(404);
  });

  it("rejects existing users and duplicate pending invitations (409)", async () => {
    const existing = await send("POST", `${ADMIN}/invitations`, owner, { email: EMAILS.ownerB, role: "VIEWER" });
    expect(existing.statusCode).toBe(409);
    expect(existing.json().error.code).toBe("USER_EXISTS");
    await invite("twice@a.test");
    const twice = await send("POST", `${ADMIN}/invitations`, owner, { email: "twice@a.test", role: "VIEWER" });
    expect(twice.json().error.code).toBe("INVITATION_PENDING");
  });

  it("previews and accepts once, creating a member who is signed in", async () => {
    const { token } = await invite("nueva@a.test", "VIEWER");
    const preview = await send("POST", `${AUTH}/invitations/preview`, undefined, { token });
    expect(InvitationPreview.parse(preview.json())).toMatchObject({ email: "nueva@a.test", role: "VIEWER", organizationName: "Org A" });

    const accepted = await send("POST", `${AUTH}/invitations/accept`, undefined, { token, name: "Nueva", password: NEW_PASSWORD });
    expect(accepted.statusCode, accepted.body).toBe(201);
    expect(SessionUser.parse(accepted.json())).toMatchObject({ email: "nueva@a.test", role: "VIEWER", organizationName: "Org A" });
    const cookie = accepted.cookies.find((c) => c.name === "synapse_session");
    expect((await send("GET", `${AUTH}/me`, `synapse_session=${cookie!.value}`)).statusCode).toBe(200);
    expect((await login("nueva@a.test", NEW_PASSWORD)).statusCode).toBe(200);

    const again = await send("POST", `${AUTH}/invitations/accept`, undefined, { token, name: "Otra", password: NEW_PASSWORD });
    expect(again.statusCode).toBe(404);
    expect((await send("POST", `${AUTH}/invitations/preview`, undefined, { token })).statusCode).toBe(404);
    const actions = (await ctx.db.select({ action: auditEvents.action }).from(auditEvents)).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["invitation.create", "invitation.accept"]));
  });

  it("refuses revoked, expired, unknown and weak-password acceptances", async () => {
    const revoked = await invite("revoked@a.test");
    expect((await send("DELETE", `${ADMIN}/invitations/${revoked.invitation.id}`, owner)).statusCode).toBe(204);
    expect((await send("DELETE", `${ADMIN}/invitations/${revoked.invitation.id}`, owner)).statusCode).toBe(404);
    expect((await send("POST", `${AUTH}/invitations/accept`, undefined, { token: revoked.token, name: "R", password: NEW_PASSWORD })).statusCode).toBe(404);

    const expired = await invite("expired@a.test");
    await ctx.db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.id, expired.invitation.id));
    expect((await send("POST", `${AUTH}/invitations/preview`, undefined, { token: expired.token })).statusCode).toBe(404);
    expect((await send("POST", `${AUTH}/invitations/accept`, undefined, { token: expired.token, name: "E", password: NEW_PASSWORD })).statusCode).toBe(404);

    const unknown = await send("POST", `${AUTH}/invitations/accept`, undefined, { token: "x".repeat(43), name: "U", password: NEW_PASSWORD });
    expect(unknown.statusCode).toBe(404);
    const weak = await invite("weak@a.test");
    expect((await send("POST", `${AUTH}/invitations/accept`, undefined, { token: weak.token, name: "W", password: "short" })).statusCode).toBe(400);
  });

  it("returns the link to the inviter when email is not configured, and self-service reset answers 503", async () => {
    const noMail = await createTestContext({ config: { isProd: true, adminPublicUrl: "https://admin.example.test" } });
    try {
      const cookie = await noMail.login(EMAILS.owner);
      const res = await noMail.app.inject({ method: "POST", url: `${ADMIN}/invitations`, headers: { cookie }, payload: { email: "n@a.test", role: "VIEWER" } });
      expect(res.statusCode, res.body).toBe(201);
      expect(res.headers["cache-control"]).toBe("no-store");
      const created = InvitationCreated.parse(res.json());
      const token = created.inviteLink?.match(/^https:\/\/admin\.example\.test\/accept-invite#token=([\w-]+)$/)?.[1];
      expect(token).toBeDefined();
      const preview = await noMail.app.inject({ method: "POST", url: `${AUTH}/invitations/preview`, payload: { token } });
      expect(InvitationPreview.parse(preview.json())).toMatchObject({ email: "n@a.test", role: "VIEWER" });
      const listed = (await noMail.app.inject({ method: "GET", url: `${ADMIN}/invitations`, headers: { cookie } })).body;
      expect(listed).not.toContain(token);
      expect((await noMail.app.inject({ method: "POST", url: `${AUTH}/password-reset/request`, payload: { email: EMAILS.viewer } })).statusCode).toBe(503);
    } finally {
      await noMail.close();
    }
  });
});

describe("password reset", () => {
  const request = (email: string) => send("POST", `${AUTH}/password-reset/request`, undefined, { email });
  const confirm = (token: string, password = NEW_PASSWORD) => send("POST", `${AUTH}/password-reset/confirm`, undefined, { token, password });

  it("answers 202 for unknown emails without sending anything", async () => {
    const res = await request("nobody@a.test");
    expect(res.statusCode).toBe(202);
    expect(outbox).toHaveLength(0);
  });

  it("sets a new password once and signs out existing sessions", async () => {
    const before = await login(EMAILS.sales, PASSWORD);
    const oldCookie = `synapse_session=${before.cookies.find((c) => c.name === "synapse_session")!.value}`;
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect((await request(EMAILS.sales.toUpperCase())).statusCode).toBe(202);
    expect(outbox[0]).toMatchObject({ to: EMAILS.sales, subject: "Restablecer contraseña" });
    const token = tokenFromLastMail("reset-password");

    expect((await confirm(token)).statusCode).toBe(204);
    expect((await login(EMAILS.sales, PASSWORD)).statusCode).toBe(401);
    expect((await login(EMAILS.sales, NEW_PASSWORD)).statusCode).toBe(200);
    expect((await send("GET", `${AUTH}/me`, oldCookie)).statusCode).toBe(401);
    expect((await confirm(token, "yet-another-password-1")).statusCode).toBe(400);
    const actions = (await ctx.db.select({ action: auditEvents.action }).from(auditEvents)).map((e) => e.action);
    expect(actions).toContain("user.password_reset");
  });

  it("burns older links when one is used, and rejects expired or weak ones", async () => {
    await request(EMAILS.viewer);
    const first = tokenFromLastMail("reset-password");
    await request(EMAILS.viewer);
    const second = tokenFromLastMail("reset-password");
    expect((await confirm(second)).statusCode).toBe(204);
    expect((await confirm(first)).statusCode).toBe(400);

    await request(EMAILS.editor);
    const expired = tokenFromLastMail("reset-password");
    await ctx.db.update(passwordResets).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await confirm(expired)).statusCode).toBe(400);

    await request(EMAILS.editor);
    expect((await confirm(tokenFromLastMail("reset-password"), "short")).statusCode).toBe(400);
  });

  it("is rate limited per IP", async () => {
    const limited = await createTestContext({ rateLimit: { login: 2 }, mailer: { send: async () => {} } });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        statuses.push((await limited.app.inject({ method: "POST", url: `${AUTH}/password-reset/request`, payload: { email: "a@a.test" } })).statusCode);
      }
      expect(statuses).toEqual([202, 202, 429]);
    } finally {
      await limited.close();
    }
  });
});
