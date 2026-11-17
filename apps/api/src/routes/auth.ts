import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { LoginInput, PasswordChangeInput, type SessionUser } from "@synapse/contracts";
import { organizationMemberships, organizations, users } from "@synapse/db";
import { audit } from "../lib/audit";
import { SESSION_COOKIE, sessionCookieOptions, session, signSession } from "../lib/auth";
import { badRequest, unauthorized } from "../lib/errors";
import { hashPassword, verifyPassword } from "../lib/passwords";

// Compared against when the email is unknown so both failure paths cost one bcrypt verification.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export interface AuthRouteOptions {
  loginRateLimit: number;
}

export default async function authRoutes(app: FastifyInstance, opts: AuthRouteOptions) {
  const credentialRateLimit = { rateLimit: { max: opts.loginRateLimit, timeWindow: "1 minute" } };

  app.post(
    "/login",
    { config: credentialRateLimit },
    async (request, reply) => {
      const input = LoginInput.parse(request.body);
      const [row] = await app.db
        .select({
          userId: users.id,
          email: users.email,
          name: users.name,
          passwordHash: users.passwordHash,
          organizationId: organizations.id,
          organizationName: organizations.name,
          role: organizationMemberships.role,
        })
        .from(users)
        .leftJoin(organizationMemberships, eq(organizationMemberships.userId, users.id))
        .leftJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
        .where(eq(users.email, input.email.trim().toLowerCase()))
        .orderBy(organizationMemberships.createdAt)
        .limit(1);

      const valid = await verifyPassword(input.password, row?.passwordHash ?? DUMMY_HASH);
      if (!row || !valid || !row.organizationId || !row.role || !row.organizationName) {
        throw unauthorized("Invalid email or password");
      }
      const token = await signSession(app.config.sessionSecret, {
        userId: row.userId,
        organizationId: row.organizationId,
        role: row.role,
      });
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(app.config));
      reply.header("Cache-Control", "no-store");
      const user: SessionUser = {
        id: row.userId,
        email: row.email,
        name: row.name,
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        role: row.role,
      };
      return user;
    },
  );

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

