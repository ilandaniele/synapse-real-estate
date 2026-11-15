import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { can, ROLES, type Action, type Role } from "@synapse/domain";
import { organizationMemberships, type Db } from "@synapse/db";
import type { Config } from "../config";
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
    /** preHandler factory: authenticates the session cookie and (optionally) checks an RBAC action. */
    requireAuth: (action?: Action) => (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    session: SessionClaims | null;
  }
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(secret: string, claims: SessionClaims): Promise<string> {
  return new SignJWT({ org: claims.organizationId, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setAudience("session")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key(secret));
}

export async function verifySession(secret: string, token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"], audience: "session" });
    const role = payload.role as Role;
    if (!payload.sub || typeof payload.org !== "string" || !ROLES.includes(role)) return null;
    return { userId: payload.sub, organizationId: payload.org, role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(config: Config) {
  return { httpOnly: true, sameSite: "lax" as const, secure: config.isProd, path: "/", maxAge: SESSION_TTL_SECONDS };
}

/** Current role of the user in the session's organization, so removed members and role changes apply at once. */
async function currentRole(db: Db, claims: SessionClaims): Promise<Role | null> {
  const [row] = await db
    .select({ role: organizationMemberships.role })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.userId, claims.userId),
        eq(organizationMemberships.organizationId, claims.organizationId),
      ),
    )
    .limit(1);
  return row ? (row.role as Role) : null;
}

export function decorateAuth(app: FastifyInstance) {
  app.decorateRequest("session", null);
  app.decorate("requireAuth", (action?: Action) => async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIE];
    const claims = token ? await verifySession(app.config.sessionSecret, token) : null;
    if (!claims) throw unauthorized();
    const role = await currentRole(app.db, claims);
    if (!role) throw unauthorized("Session is no longer valid");
    if (action && !can(role, action)) throw forbidden();
    request.session = { ...claims, role };
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
