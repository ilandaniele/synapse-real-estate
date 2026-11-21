import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { JWTVerifyGetKey } from "jose";
import { GoogleLoginInput, LoginInput, PasswordChangeInput, type AuthProviders, type SessionUser } from "@synapse/contracts";
import { organizationMemberships, organizations, users } from "@synapse/db";
import { audit } from "../lib/audit";
import { SESSION_COOKIE, sessionCookieOptions, session, signSession } from "../lib/auth";
import { badRequest, unauthorized } from "../lib/errors";
import { googleSigningKeys, verifiedGoogleEmail } from "../lib/google";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../lib/passwords";
import { findSignInCandidate, isMember, startSession } from "../lib/sign-in";

export interface AuthRouteOptions {
  loginRateLimit: number;
  /** Google's signing keys; tests pass local ones. */
  googleKeys?: JWTVerifyGetKey;
}

export default async function authRoutes(app: FastifyInstance, opts: AuthRouteOptions) {
  const credentialRateLimit = { rateLimit: { max: opts.loginRateLimit, timeWindow: "1 minute" } };

  app.post("/login", { config: credentialRateLimit }, async (request, reply) => {
    const input = LoginInput.parse(request.body);
    const candidate = await findSignInCandidate(app, input.email);
    const valid = await verifyPassword(input.password, candidate?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!valid || !isMember(candidate)) throw unauthorized("Invalid email or password");
    return startSession(app, reply, candidate);
  });

  app.get("/providers", async () => {
    const providers: AuthProviders = { google: app.config.googleClientId ? { clientId: app.config.googleClientId } : null };
    return providers;
  });

  const googleClientId = app.config.googleClientId;
  if (googleClientId) {
    const keys = opts.googleKeys ?? googleSigningKeys();
    app.post("/google", { config: credentialRateLimit }, async (request, reply) => {
      const { credential } = GoogleLoginInput.parse(request.body);
      const email = await verifiedGoogleEmail(credential, googleClientId, keys);
      const candidate = email ? await findSignInCandidate(app, email) : undefined;
      if (!isMember(candidate)) throw unauthorized("This Google account has no access");
      return startSession(app, reply, candidate);
    });
  }

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    reply.header("Cache-Control", "no-store");
    return { ok: true };
  });

  /** Changes the password, revokes every other session of the user and re-issues the current one. */
  app.post("/password", { preHandler: app.requireAuth(), config: credentialRateLimit }, async (request, reply) => {
    const claims = session(request);
    const input = PasswordChangeInput.parse(request.body);
    const [user] = await app.db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, claims.userId));
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw badRequest("Current password is incorrect");
    }
    const passwordHash = await hashPassword(input.newPassword);
    await app.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, sessionsValidAfter: new Date() }).where(eq(users.id, claims.userId));
      await audit(tx, claims, "user.password_change", "user", claims.userId);
    });
    reply.setCookie(SESSION_COOKIE, await signSession(app.config.sessionSecret, claims), sessionCookieOptions(app.config));
    reply.header("Cache-Control", "no-store");
    return reply.status(204).send();
  });

  app.get("/me", { preHandler: app.requireAuth() }, async (request, reply) => {
    const claims = session(request);
    const [row] = await app.db
      .select({ id: users.id, email: users.email, name: users.name, organizationName: organizations.name })
      .from(users)
      .innerJoin(organizationMemberships, and(eq(organizationMemberships.userId, users.id), eq(organizationMemberships.organizationId, claims.organizationId)))
      .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
      .where(eq(users.id, claims.userId));
    if (!row) throw unauthorized("Session is no longer valid");
    reply.header("Cache-Control", "no-store");
    const user: SessionUser = { ...row, organizationId: claims.organizationId, role: claims.role };
    return user;
  });
}

