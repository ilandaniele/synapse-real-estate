import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { can, ROLES, type Action, type Role } from "@synapse/domain";
import { organizationMemberships, users, type Db } from "@synapse/db";
import type { ObjectStorage } from "@synapse/storage";
import type { Config } from "../config";
import type { Mailer } from "./mailer";
import type { PaymentGateway } from "./stripe";
import { forbidden, unauthorized } from "./errors";

export const SESSION_COOKIE = "synapse_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface SessionClaims {
  userId: string;
  organizationId: string;
  role: Role;
}

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    config: Config;
    storage: ObjectStorage;
    /** Null in production without SMTP_URL: email features answer 503. */
    mailer: Mailer | null;
    /** Null unless PAYMENT_PROVIDER=stripe (or a test injects a gateway). */
    paymentGateway: PaymentGateway | null;
    /** preHandler factory: authenticates the session cookie and (optionally) checks an RBAC action. */
    requireAuth: (action?: Action) => (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    session: SessionClaims | null;
  }
}

export const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(secret: string, claims: SessionClaims): Promise<string> {
  return new SignJWT({ org: claims.organizationId, role: claims.role, iatMs: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setAudience("session")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

interface VerifiedSession extends SessionClaims {
  /** Issue time in milliseconds (JWT `iat` only has second precision). */
  issuedAtMs: number;
}

export async function verifySession(secret: string, token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"], audience: "session" });
    const role = payload.role as Role;
    if (!payload.sub || typeof payload.org !== "string" || !ROLES.includes(role) || typeof payload.iatMs !== "number") return null;
    return { userId: payload.sub, organizationId: payload.org, role, issuedAtMs: payload.iatMs };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(config: Config) {
  return { httpOnly: true, sameSite: "lax" as const, secure: config.isProd, path: "/", maxAge: SESSION_TTL_SECONDS };
}

/**
 * Current role of the user in the session's organization, so removed members and role changes apply at once;
 * null when the membership is gone or the token predates the user's session cutoff.
 */
async function currentRole(db: Db, session: VerifiedSession): Promise<Role | null> {
  const [row] = await db
    .select({ role: organizationMemberships.role, sessionsValidAfter: users.sessionsValidAfter })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.userId, session.userId),
        eq(organizationMemberships.organizationId, session.organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.sessionsValidAfter && session.issuedAtMs < row.sessionsValidAfter.getTime()) return null;
  return row.role as Role;
}

export function decorateAuth(app: FastifyInstance) {
  app.decorateRequest("session", null);
  app.decorate("requireAuth", (action?: Action) => async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIE];
    const verified = token ? await verifySession(app.config.sessionSecret, token) : null;
    if (!verified) throw unauthorized();
    const role = await currentRole(app.db, verified);
    if (!role) throw unauthorized("Session is no longer valid");
    if (action && !can(role, action)) throw forbidden();
    request.session = { userId: verified.userId, organizationId: verified.organizationId, role };
  });
}

/** The authenticated session; only valid on routes guarded by requireAuth. */
export function session(request: FastifyRequest): SessionClaims {
  if (!request.session) throw unauthorized();
  return request.session;
}

/** sha256(ip + SESSION_SECRET): lets us spot repeat submitters without storing the raw IP. */
export function hashIp(ip: string, secret: string): string {
  return createHash("sha256").update(ip).update(secret).digest("hex");
}
