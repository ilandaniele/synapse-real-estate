import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Member } from "@synapse/contracts";
import { ADMIN, createTestContext, EMAILS, PASSWORD, type TestContext } from "./helpers";

let ctx: TestContext;
let owner: string;
beforeAll(async () => {
  ctx = await createTestContext();
  owner = await ctx.login(EMAILS.owner);
});
afterAll(() => ctx.close());

const send = (method: "POST" | "PATCH" | "DELETE" | "GET", url: string, cookie: string | undefined, payload?: object) =>
  ctx.app.inject({ method, url, headers: cookie ? { cookie } : {}, ...(payload ? { payload } : {}) });

const login = (email: string, password: string) => ctx.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password } });

const sessionCookie = (res: Awaited<ReturnType<typeof login>>) => {
  const cookie = res.cookies.find((c) => c.name === "synapse_session");
  if (!cookie) throw new Error("no session cookie");
  return `synapse_session=${cookie.value}`;
};

const NEW_PASSWORD = "another-password-456";

async function createMember(email: string, role = "EDITOR") {
  const res = await send("POST", `${ADMIN}/members`, owner, { email, name: "Nuevo", role, password: NEW_PASSWORD });
  expect(res.statusCode, res.body).toBe(201);
  return Member.parse(res.json());
}

describe("members", () => {
  it("lists members without sensitive fields", async () => {
    const res = await send("GET", `${ADMIN}/members`, owner);
    expect(res.statusCode).toBe(200);
    const members = res.json() as Member[];
    expect(members.map((m) => m.email)).toEqual(expect.arrayContaining([EMAILS.owner, EMAILS.editor, EMAILS.sales, EMAILS.viewer]));
    expect(members.map((m) => m.email)).not.toContain(EMAILS.ownerB);
    expect(res.body).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("is restricted to owners (401/403)", async () => {
    expect((await send("GET", `${ADMIN}/members`, undefined)).statusCode).toBe(401);
    const editor = await ctx.login(EMAILS.editor);
    expect((await send("GET", `${ADMIN}/members`, editor)).statusCode).toBe(403);
    expect((await send("POST", `${ADMIN}/members`, editor, { email: "x@a.test", name: "X", role: "OWNER", password: NEW_PASSWORD })).statusCode).toBe(403);
  });

  it("creates a member who can log in, and rejects duplicates and weak passwords", async () => {
    const member = await createMember("Nuevo@A.test");
    expect(member).toMatchObject({ email: "nuevo@a.test", role: "EDITOR" });
    expect((await login("nuevo@a.test", NEW_PASSWORD)).statusCode).toBe(200);

    const duplicate = await send("POST", `${ADMIN}/members`, owner, { email: EMAILS.ownerB, name: "Dup", role: "VIEWER", password: NEW_PASSWORD });
    expect(duplicate.statusCode).toBe(409);
    const weak = await send("POST", `${ADMIN}/members`, owner, { email: "weak@a.test", name: "W", role: "VIEWER", password: "short" });
    expect(weak.statusCode).toBe(400);
  });

  it("changes roles and keeps at least one owner", async () => {
    const member = await createMember("promoted@a.test");
    const promoted = await send("PATCH", `${ADMIN}/members/${member.id}`, owner, { role: "SALES" });
    expect(promoted.json()).toMatchObject({ role: "SALES" });

    const members = (await send("GET", `${ADMIN}/members`, owner)).json() as Member[];
    const self = members.find((m) => m.email === EMAILS.owner)!;
    const demote = await send("PATCH", `${ADMIN}/members/${self.id}`, owner, { role: "EDITOR" });
    expect(demote.statusCode).toBe(409);
    expect(demote.json().error.code).toBe("LAST_OWNER");
    expect((await send("DELETE", `${ADMIN}/members/${self.id}`, owner)).statusCode).toBe(409);
  });

  it("deletes a member and their account, revoking access", async () => {
    const member = await createMember("leaving@a.test");
    const cookie = sessionCookie(await login("leaving@a.test", NEW_PASSWORD));
    expect((await send("DELETE", `${ADMIN}/members/${member.id}`, owner)).statusCode).toBe(204);
    expect((await send("GET", "/api/v1/auth/me", cookie)).statusCode).toBe(401);
    expect((await login("leaving@a.test", NEW_PASSWORD)).statusCode).toBe(401);
    expect((await send("DELETE", `${ADMIN}/members/${member.id}`, owner)).statusCode).toBe(404);
  });

  it("hides other organizations' members (404)", async () => {
    const ownerB = await ctx.login(EMAILS.ownerB);
    const members = (await send("GET", `${ADMIN}/members`, owner)).json() as Member[];
    const editor = members.find((m) => m.email === EMAILS.editor)!;
    expect((await send("PATCH", `${ADMIN}/members/${editor.id}`, ownerB, { role: "OWNER" })).statusCode).toBe(404);
    expect((await send("DELETE", `${ADMIN}/members/${editor.id}`, ownerB)).statusCode).toBe(404);
  });
});

describe("password change", () => {
  it("requires the current password", async () => {
    const cookie = sessionCookie(await login(EMAILS.sales, PASSWORD));
    const res = await send("POST", "/api/v1/auth/password", cookie, { currentPassword: "wrong-password-000", newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(400);
    expect((await send("POST", "/api/v1/auth/password", undefined, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).statusCode).toBe(401);
  });

  it("rotates the password, revokes older sessions and keeps the current one", async () => {
    const old = sessionCookie(await login(EMAILS.viewer, PASSWORD));
    const res = await send("POST", "/api/v1/auth/password", old, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(204);
    const fresh = sessionCookie(res as Awaited<ReturnType<typeof login>>);

    expect((await send("GET", "/api/v1/auth/me", old)).statusCode).toBe(401);
    expect((await send("GET", "/api/v1/auth/me", fresh)).statusCode).toBe(200);
    expect((await login(EMAILS.viewer, PASSWORD)).statusCode).toBe(401);
    expect((await login(EMAILS.viewer, NEW_PASSWORD)).statusCode).toBe(200);
  });
});
