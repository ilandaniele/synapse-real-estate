import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { SessionUser } from "@synapse/contracts";
import type { Role } from "@synapse/domain";
import { organizationMemberships, organizations, users } from "@synapse/db";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "./auth";

export interface SignInCandidate {
  userId: string;
  email: string;
  name: string;
  passwordHash: string;
  organizationId: string | null;
  organizationName: string | null;
  role: Role | null;
}

export type Member = SignInCandidate & { organizationId: string; organizationName: string; role: Role };

/** The user with this email and their oldest membership, if any. */
export async function findSignInCandidate(app: FastifyInstance, email: string): Promise<SignInCandidate | undefined> {
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
    .where(eq(users.email, email.trim().toLowerCase()))
    .orderBy(organizationMemberships.createdAt)
    .limit(1);
  return row as SignInCandidate | undefined;
}

/** Sets the session cookie for a member and returns the user the admin keeps in memory. */
export async function startSession(
  app: FastifyInstance,
  reply: FastifyReply,
  member: Member,
): Promise<SessionUser> {
  const token = await signSession(app.config.sessionSecret, { userId: member.userId, organizationId: member.organizationId, role: member.role });
  reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(app.config));
  reply.header("Cache-Control", "no-store");
  return {
    id: member.userId,
    email: member.email,
    name: member.name,
    organizationId: member.organizationId,
    organizationName: member.organizationName,
    role: member.role,
  };
}

/** Narrows a candidate to one that belongs to an organization. */
export function isMember(candidate: SignInCandidate | undefined): candidate is Member {
  return Boolean(candidate?.organizationId && candidate.organizationName && candidate.role);
}
