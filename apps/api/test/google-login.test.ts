import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { ApiError } from "@synapse/contracts";
import { createTestContext, EMAILS, type TestContext } from "./helpers";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const URL_GOOGLE = "/api/v1/auth/google";

let ctx: TestContext;
let googleKey: CryptoKey;
let strangerKey: CryptoKey;

async function idToken(claims: JWTPayload = {}, key: CryptoKey = googleKey, expiresIn = "5m"): Promise<string> {
  return new SignJWT({ iss: "https://accounts.google.com", aud: CLIENT_ID, email: EMAILS.editor, email_verified: true, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "google-test" })
    .setSubject("1234567890")
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

beforeAll(async () => {
  const google = await generateKeyPair("RS256");
  googleKey = google.privateKey;
  strangerKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(google.publicKey)), kid: "google-test", alg: "RS256" };
  ctx = await createTestContext({ config: { googleClientId: CLIENT_ID }, googleKeys: createLocalJWKSet({ keys: [jwk] }) });
});
afterAll(() => ctx.close());

describe("Google sign-in", () => {
  it("advertises the Google client id", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/v1/auth/providers" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ google: { clientId: CLIENT_ID } });
  });

  it("signs in an existing member with a verified Google email", async () => {
    const res = await ctx.app.inject({ method: "POST", url: URL_GOOGLE, payload: { credential: await idToken({ email: "Editor@A.test" }) } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ email: EMAILS.editor, role: "EDITOR", organizationId: ctx.fx.orgA });
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toContain("synapse_session=");
    expect(setCookie).toMatch(/HttpOnly/i);

    const cookie = setCookie.split(";")[0]!;
    const me = await ctx.app.inject({ method: "GET", url: "/api/v1/auth/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: EMAILS.editor });
  });

  it.each([
    ["an email with no account", { email: "stranger@gmail.com" }],
    ["an unverified email", { email_verified: false }],
    ["another app's token", { aud: "someone-else.apps.googleusercontent.com" }],
    ["a token from another issuer", { iss: "https://evil.example" }],
  ])("rejects %s without a cookie", async (_label, claims) => {
    const res = await ctx.app.inject({ method: "POST", url: URL_GOOGLE, payload: { credential: await idToken(claims) } });
    expect(res.statusCode).toBe(401);
    expect(ApiError.safeParse(res.json()).success).toBe(true);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects expired tokens and tokens not signed by Google", async () => {
    const expired = await ctx.app.inject({ method: "POST", url: URL_GOOGLE, payload: { credential: await idToken({}, googleKey, "-1m") } });
    const forged = await ctx.app.inject({ method: "POST", url: URL_GOOGLE, payload: { credential: await idToken({}, strangerKey) } });
    expect(expired.statusCode).toBe(401);
    expect(forged.statusCode).toBe(401);
  });

  it("validates the body", async () => {
    const res = await ctx.app.inject({ method: "POST", url: URL_GOOGLE, payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Google sign-in disabled", () => {
  let plain: TestContext;
  beforeAll(async () => {
    plain = await createTestContext();
  });
  afterAll(() => plain.close());

  it("advertises no provider and does not expose the route", async () => {
    const providers = await plain.app.inject({ method: "GET", url: "/api/v1/auth/providers" });
    expect(providers.json()).toEqual({ google: null });
    const res = await plain.app.inject({ method: "POST", url: URL_GOOGLE, payload: { credential: "x" } });
    expect(res.statusCode).toBe(404);
  });
});
