import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { ApiError, BuyerFavorites, BuyerProfile } from "@synapse/contracts";
import { ADMIN, createTestContext, EMAILS, PASSWORD, type TestContext } from "./helpers";

const BUYER = "/api/v1/buyer";
const CLIENT_ID = "test-client.apps.googleusercontent.com";
const BUYER_PASSWORD = "buyer-password-123";
const MISSING_UNIT = "00000000-0000-4000-8000-000000000000";

let ctx: TestContext;
let googleKey: CryptoKey;

const cookieFrom = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"]).split(";")[0]!;

function register(email: string, name = "Ana Compradora") {
  return ctx.app.inject({ method: "POST", url: `${BUYER}/register`, payload: { name, email, password: BUYER_PASSWORD } });
}

async function registeredCookie(email: string): Promise<string> {
  const res = await register(email);
  expect(res.statusCode).toBe(201);
  return cookieFrom(res);
}

function idToken(claims: JWTPayload): Promise<string> {
  return new SignJWT({ iss: "https://accounts.google.com", aud: CLIENT_ID, email_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "google-test" })
    .setSubject("buyer-google-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(googleKey);
}

const googleSignIn = async (claims: JWTPayload) =>
  ctx.app.inject({ method: "POST", url: `${BUYER}/google`, payload: { credential: await idToken(claims) } });
const me = (cookie: string) => ctx.app.inject({ method: "GET", url: `${BUYER}/me`, headers: { cookie } });
const favorite = (cookie: string, unitId: string, method: "PUT" | "DELETE" = "PUT") =>
  ctx.app.inject({ method, url: `${BUYER}/favorites/${unitId}`, headers: { cookie } });

beforeAll(async () => {
  const google = await generateKeyPair("RS256");
  googleKey = google.privateKey;
  const jwk = { ...(await exportJWK(google.publicKey)), kid: "google-test", alg: "RS256" };
  ctx = await createTestContext({ config: { googleClientId: CLIENT_ID }, googleKeys: createLocalJWKSet({ keys: [jwk] }) });
  const owner = await ctx.login(EMAILS.owner);
  const published = await ctx.app.inject({ method: "POST", url: `${ADMIN}/developments/${ctx.fx.devA}/publish`, headers: { cookie: owner } });
  expect(published.statusCode).toBe(201);
});
afterAll(() => ctx.close());

describe("buyer accounts", () => {
  it("registers, signs in with a buyer cookie and never returns the password hash", async () => {
    const res = await register("Ana@Example.test");
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), email: "ana@example.test", name: "Ana Compradora" });
    expect(res.headers["cache-control"]).toBe("no-store");
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toContain("synapse_buyer=");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const profile = await me(cookieFrom(res));
    expect(profile.statusCode).toBe(200);
    expect(BuyerProfile.parse(profile.json())).toMatchObject({ email: "ana@example.test", favoriteUnitIds: [] });
    expect(profile.body).not.toContain("password");
  });

  it("answers 409 for an email that already has an account", async () => {
    await registeredCookie("dup@example.test");
    const res = await register("DUP@example.test");
    expect(res.statusCode).toBe(409);
    expect(ApiError.safeParse(res.json()).success).toBe(true);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects short passwords and malformed emails", async () => {
    const short = await ctx.app.inject({ method: "POST", url: `${BUYER}/register`, payload: { name: "X", email: "x@example.test", password: "short" } });
    expect(short.statusCode).toBe(400);
    const email = await ctx.app.inject({ method: "POST", url: `${BUYER}/register`, payload: { name: "X", email: "nope", password: BUYER_PASSWORD } });
    expect(email.statusCode).toBe(400);
  });

  it("logs in with the right password and rejects a wrong one or an unknown email", async () => {
    await registeredCookie("login@example.test");
    const ok = await ctx.app.inject({ method: "POST", url: `${BUYER}/login`, payload: { email: "LOGIN@example.test", password: BUYER_PASSWORD } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ email: "login@example.test" });
    expect(String(ok.headers["set-cookie"])).toContain("synapse_buyer=");

    for (const payload of [
      { email: "login@example.test", password: "wrong-password-123" },
      { email: "nobody@example.test", password: BUYER_PASSWORD },
    ]) {
      const res = await ctx.app.inject({ method: "POST", url: `${BUYER}/login`, payload });
      expect(res.statusCode).toBe(401);
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("does not let staff credentials sign in as a buyer", async () => {
    const res = await ctx.app.inject({ method: "POST", url: `${BUYER}/login`, payload: { email: EMAILS.owner, password: PASSWORD } });
    expect(res.statusCode).toBe(401);
  });

  it("logs out by clearing the buyer cookie", async () => {
    const res = await ctx.app.inject({ method: "POST", url: `${BUYER}/logout` });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["set-cookie"])).toMatch(/synapse_buyer=;/);
  });
});

describe("buyer Google sign-in", () => {
  it("creates an account for a new Google user, then signs the same account in again", async () => {
    const first = await googleSignIn({ email: "Gina@Gmail.test", name: "Gina Google" });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ email: "gina@gmail.test", name: "Gina Google" });

    const second = await googleSignIn({ email: "gina@gmail.test" });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect((await me(cookieFrom(second))).statusCode).toBe(200);
  });

  it("names an account without a Google name after the email", async () => {
    const res = await googleSignIn({ email: "noname@gmail.test" });
    expect(res.json()).toMatchObject({ name: "noname" });
  });

  it("rejects an unverified Google email", async () => {
    const res = await googleSignIn({ email: "x@gmail.test", email_verified: false });
    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("keeps a Google-only account from signing in with a password", async () => {
    const res = await ctx.app.inject({ method: "POST", url: `${BUYER}/login`, payload: { email: "gina@gmail.test", password: BUYER_PASSWORD } });
    expect(res.statusCode).toBe(401);
  });
});

describe("buyer favorites", () => {
  it("adds, lists and removes favorites", async () => {
    const cookie = await registeredCookie("fav@example.test");
    expect((await favorite(cookie, ctx.fx.unitA1)).statusCode).toBe(204);
    expect((await favorite(cookie, ctx.fx.unitA3)).statusCode).toBe(204);
    expect((await favorite(cookie, ctx.fx.unitA1)).statusCode).toBe(204);

    expect((await me(cookie)).json().favoriteUnitIds).toEqual([ctx.fx.unitA3, ctx.fx.unitA1]);
    const list = await ctx.app.inject({ method: "GET", url: `${BUYER}/favorites`, headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.headers["cache-control"]).toBe("no-store");
    expect(BuyerFavorites.parse(list.json()).items.map((u) => u.code)).toEqual(["V3", "V1"]);

    expect((await favorite(cookie, ctx.fx.unitA3, "DELETE")).statusCode).toBe(204);
    expect((await me(cookie)).json().favoriteUnitIds).toEqual([ctx.fx.unitA1]);
  });

  it("answers 404 for unknown, unlisted or unpublished units and 400 for a malformed id", async () => {
    const cookie = await registeredCookie("fav404@example.test");
    for (const unitId of [MISSING_UNIT, ctx.fx.unitA2, ctx.fx.unitB1]) {
      expect((await favorite(cookie, unitId)).statusCode).toBe(404);
    }
    expect((await favorite(cookie, "not-a-uuid")).statusCode).toBe(400);
  });

  it("keeps each buyer's favorites to themselves", async () => {
    const a = await registeredCookie("first-buyer@example.test");
    const b = await registeredCookie("second-buyer@example.test");
    await favorite(a, ctx.fx.unitA1);
    expect((await me(b)).json().favoriteUnitIds).toEqual([]);
  });
});

describe("buyer and staff sessions stay separate", () => {
  it("answers 401 without a cookie", async () => {
    for (const [method, url] of [
      ["GET", `${BUYER}/me`],
      ["GET", `${BUYER}/favorites`],
      ["PUT", `${BUYER}/favorites/${MISSING_UNIT}`],
      ["DELETE", `${BUYER}/favorites/${MISSING_UNIT}`],
    ] as const) {
      expect((await ctx.app.inject({ method, url })).statusCode).toBe(401);
    }
  });

  it("rejects a staff session cookie on buyer routes", async () => {
    const staff = await ctx.login(EMAILS.owner);
    const token = staff.split("=")[1];
    for (const cookie of [staff, `synapse_buyer=${token}`]) {
      expect((await me(cookie)).statusCode).toBe(401);
    }
  });

  it("rejects a buyer session cookie on admin routes", async () => {
    const buyer = await registeredCookie("intruder@example.test");
    const token = buyer.split("=")[1];
    for (const cookie of [buyer, `synapse_session=${token}`]) {
      expect((await ctx.app.inject({ method: "GET", url: `${ADMIN}/developments`, headers: { cookie } })).statusCode).toBe(401);
      expect((await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } })).statusCode).toBe(401);
    }
  });
});

describe("buyer rate limits", () => {
  it("limits credential attempts per IP", async () => {
    const limited = await createTestContext({ rateLimit: { login: 3 } });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await limited.app.inject({ method: "POST", url: `${BUYER}/login`, payload: { email: "x@example.test", password: BUYER_PASSWORD } });
        codes.push(res.statusCode);
      }
      expect(codes).toEqual([401, 401, 401, 429, 429]);
    } finally {
      await limited.close();
    }
  });
});
